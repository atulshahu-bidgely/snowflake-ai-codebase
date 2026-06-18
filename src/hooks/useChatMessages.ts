/**
 * useChatMessages Hook
 * Manages chat message state and streaming logic
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '../types/chat';
import { ChartContent } from '../types/chart';
import { config } from '../config/env';
import { extractSqlQuery, extractVerificationInfo, hasUsableChartData } from '../utils/chatUtils';
import { ERROR_TEXT, API_DEFAULTS, getApiStatusMessage } from '../constants/textConstants';
const MAX_MESSAGES = 100;
export const useChatMessages = (selectedAgent: string, onCreditsLeft?: (creditsLeft: number) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // --- Sleep / wake recovery -------------------------------------------------
  // When the computer sleeps mid-query the streaming socket dies, so the
  // in-flight fetch rejects (in Safari with "Load failed"). We detect the wake
  // and resume the query in place instead of surfacing a raw network error.
  const MAX_SLEEP_RETRIES = 3;
  const SLEEP_RETRY_DELAY_MS = 1500;
  const RECONNECTING_STATUS = 'Connection dropped — reconnecting…';
  const sendMessageRef = useRef<((...args: any[]) => any) | null>(null);
  const lastRequestRef = useRef<{
    message: string;
    displayText?: string;
    isTarget?: boolean;
    isAnalysis?: boolean;
    category?: string;
    assistantMessageId: string;
  } | null>(null);
  const retryCountRef = useRef(0);
  const wokeRecentlyRef = useRef(false);
  const sleepAbortRef = useRef(false);
  const computerSleepConnectionBreakKeyRef = useRef<string>('');
  const sendMessage = useCallback(async (
    message: string,
    displayText?: string,
    isTarget?: boolean,
    isAnalysis?: boolean,
    category?: string,
    opts?: { retryOfId?: string }
  ) => {
    if (!message.trim() || isLoading) return;
    const isRetry = !!opts?.retryOfId;
    if (!isRetry) retryCountRef.current = 0;

    if (!isRetry) {
      // Stable key for this user-initiated query; reused on every auto-resume so
      // the backend charges credits only once even if we reconnect after a sleep.
      computerSleepConnectionBreakKeyRef.current =
        (globalThis.crypto && 'randomUUID' in globalThis.crypto)
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    const computerSleepConnectionBreakKey = computerSleepConnectionBreakKeyRef.current;

    let assistantMessageId: string;
    if (isRetry) {
      // Resume in the existing assistant bubble rather than adding new messages.
      assistantMessageId = opts!.retryOfId!;
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              text: '',
              status: 'thinking' as const,
              isStreaming: true,
              streamingStatus: RECONNECTING_STATUS,
              error: undefined,
            }
          : msg
      ));
    } else {
      const messageId = Date.now().toString();
      const userMessage: ChatMessage = {
        id: messageId + '_user',
        text: (displayText ?? message).trim(),
        sender: 'user',
        timestamp: new Date()
      };
      assistantMessageId = messageId + '_assistant';
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        text: '',
        sender: 'assistant',
        timestamp: new Date(),
        status: 'thinking',
        isStreaming: true,
        streamingStatus: undefined,
        thinkingSteps: [],
        sqlQueries: [],
        timeline: [],
        toolsUsed: [],
        isTarget: isTarget ?? false,
        isAnalysis: isAnalysis ?? false,
      };
      setMessages(prev => {
        const newMessages = [...prev, userMessage, assistantMessage];
        // Trim to max messages to prevent memory issues
        return newMessages.length > MAX_MESSAGES
          ? newMessages.slice(-MAX_MESSAGES)
          : newMessages;
      });
    }
    // Remember the request so it can be resumed after a sleep/network drop.
    lastRequestRef.current = { message, displayText, isTarget, isAnalysis, category, assistantMessageId };
    setIsLoading(true);
    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    sleepAbortRef.current = false;
    try {
      const requestBody = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: message.trim()
              }
            ]
          }
        ],
        tool_choice: {
          type: "auto"
        },
        stream: true,
        // Which category card the user picked (e.g. "Analyse Trends") — forwarded
        // to the backend so it can be attached to the LangSmith run metadata.
        metadata: category ? { category } : undefined
      };
      // Call backend proxy instead of Snowflake directly (secure: PAT never exposed to browser)
      const backendEndpoint = `${config.backendUrl}/api/agents/${encodeURIComponent(selectedAgent)}/messages`;

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Computer-Sleep-Connection-Break-Key': computerSleepConnectionBreakKey
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });

      // Only update the credits display when the request actually went through.
      // A rejected request (e.g. 402 insufficient credits) deducts nothing on the
      // backend, so the pill must stay unchanged.
      if (response.ok) {
        const creditsHeader = response.headers.get('x-credits-left');
        if (creditsHeader !== null && onCreditsLeft) {
          const n = Number(creditsHeader);
          if (!Number.isNaN(n)) onCreditsLeft(n);
        }
      }

      if (!response.ok) {
        // Try to get JSON error message from backend
        let errorMessage = `${ERROR_TEXT.API_ERROR}: ${response.status} ${response.statusText}`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            // Backend now sends errorParts as an array to preserve structure
            errorMessage = errorData.errorParts
              ? errorData.errorParts.join('\n\n')  // Join array with double newlines
              : (errorData.error || errorData.message || errorMessage);
          }
        } catch {
          // If parsing fails, use default message
        }
        // Attach fullMessage to preserve \n\n (Error.message normalizes newlines)
        const error = new Error(errorMessage);
        (error as any).fullMessage = errorMessage;
        throw error;
      }
      const reader = response.body?.getReader();
      if (!reader) {
        const errorMessage = ERROR_TEXT.NO_READABLE_STREAM;
        const error = new Error(errorMessage);
        (error as any).fullMessage = errorMessage;
        throw error;
      }
      const decoder = new TextDecoder();
      let assistantText = '';
      let currentEvent = '';
      let streamErrorMessage = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === 'response.text.delta' && data.text) {
                assistantText += data.text;
                const currentText = assistantText;
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        text: currentText,
                        status: 'thinking' as const,
                        isStreaming: true
                      }
                    : msg
                ));
              } else if (currentEvent === 'response.status' && data.message) {
                const statusMessage = getApiStatusMessage(data.message);
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        status: 'thinking' as const,
                        streamingStatus: statusMessage,
                        thinkingSteps: (msg.thinkingSteps || []).includes(statusMessage)
                          ? msg.thinkingSteps
                          : [...(msg.thinkingSteps || []), statusMessage],
                        timeline: [
                          ...(msg.timeline || []),
                          { type: 'status', content: statusMessage, timestamp: new Date() }
                        ]
                      }
                    : msg
                ));
              } else if (currentEvent === 'response.tool_result') {
                const toolStatus = API_DEFAULTS.PROCESSING_RESULTS;
                const sqlQuery = extractSqlQuery(data);
                const verificationInfo = extractVerificationInfo(data);

                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        status: 'thinking' as const,
                        streamingStatus: toolStatus,
                        thinkingSteps: (msg.thinkingSteps || []).includes(toolStatus)
                          ? msg.thinkingSteps
                          : [...(msg.thinkingSteps || []), toolStatus],
                        sqlQueries: sqlQuery
                          ? [...(msg.sqlQueries || []), {
                              sql: sqlQuery,
                              verification: verificationInfo || undefined
                            }]
                          : msg.sqlQueries,
                        timeline: [
                          ...(msg.timeline || []),
                          { type: 'tool', content: toolStatus, timestamp: new Date() },
                          ...(sqlQuery ? [{ type: 'sql' as const, content: sqlQuery, timestamp: new Date() }] : [])
                        ]
                      }
                    : msg
                ));
              } else if (currentEvent === 'response.thinking' && data.thinking && data.thinking.text) {
                const thinkingText = data.thinking.text.trim();
                if (thinkingText) {
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          status: 'thinking' as const,
                          thinkingTexts: [...(msg.thinkingTexts || []), thinkingText],
                          timeline: [
                            ...(msg.timeline || []),
                            { type: 'thinking', content: thinkingText, timestamp: new Date() }
                          ]
                        }
                      : msg
                  ));
                }
              } else if (currentEvent === 'response.thinking.delta' && data.text) {
                const deltaText = data.text;
                if (deltaText) {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id === assistantMessageId) {
                      const currentThinkingTexts = msg.thinkingTexts || [];
                      const lastIndex = currentThinkingTexts.length - 1;

                      if (lastIndex >= 0) {
                        const updatedThinkingTexts = [...currentThinkingTexts];
                        updatedThinkingTexts[lastIndex] = updatedThinkingTexts[lastIndex] + deltaText;

                        return {
                          ...msg,
                          status: 'thinking' as const,
                          thinkingTexts: updatedThinkingTexts
                        };
                      } else {
                        return {
                          ...msg,
                          status: 'thinking' as const,
                          thinkingTexts: [deltaText],
                          timeline: [
                            ...(msg.timeline || []),
                            { type: 'thinking', content: 'Processing thinking...', timestamp: new Date() }
                          ]
                        };
                      }
                    }
                    return msg;
                  }));
                }
              } else if (currentEvent === 'response.chart') {
                if (data.chart_spec) {
                  try {
                    const chartSpec = JSON.parse(data.chart_spec);
                    if (!hasUsableChartData(chartSpec)) {
                      continue;
                    }
                    const chartContent: ChartContent = {
                      type: 'vega-lite' as const,
                      chart_spec: chartSpec
                    };

                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            charts: [...(msg.charts || []), chartContent],
                            timeline: [
                              ...(msg.timeline || []),
                              { type: 'chart', content: 'Chart visualization added', timestamp: new Date() }
                            ]
                          }
                        : msg
                    ));
                  } catch (parseError) {
                    // Skip malformed chart data
                  }
                }
              } else if (currentEvent === 'response.text.annotation') {
                // Handle annotations (citations, sources, references, etc.)
                if (data) {
                  try {
                    // Extract annotation from nested structure
                    const annotationData = data.annotation || data;

                    const annotation = {
                      type: annotationData.type || 'citation',
                      start_index: data.start_index,
                      end_index: data.end_index,
                      annotation_index: data.annotation_index,
                      content_index: data.content_index,
                      text: annotationData.text,
                      url: annotationData.doc_id, // Use doc_id as URL
                      title: annotationData.doc_title,
                      source: annotationData.source,
                      doc_id: annotationData.doc_id,
                      search_result_id: annotationData.search_result_id,
                      index: annotationData.index
                    };

                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            annotations: [...(msg.annotations || []), annotation],
                            timeline: [
                              ...(msg.timeline || []),
                              {
                                type: 'annotation',
                                content: `Citation: ${annotation.title || 'Reference'}`,
                                timestamp: new Date()
                              }
                            ]
                          }
                        : msg
                    ));
                  } catch (annotationError) {
                    // Skip malformed annotation data
                    console.warn('Failed to process annotation:', annotationError);
                  }
                }
              } else if (currentEvent === 'response.credits_adjusted' && typeof data.creditsLeft === 'number') {
                if (onCreditsLeft) onCreditsLeft(data.creditsLeft);
              } else if (currentEvent === 'response.run_id' && data.run_id) {
                const rid = data.run_id;
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId ? { ...msg, runId: rid } : msg
                ));
              } else if (currentEvent === 'response.error') {
                streamErrorMessage = data.message || ERROR_TEXT.UNKNOWN_ERROR;
              }
            } catch (parseError) {
              // Skip malformed streaming data
            }
            if (streamErrorMessage) {
              const error = new Error(streamErrorMessage);
              (error as any).fullMessage = streamErrorMessage;
              throw error;
            }
          }
        }
      }
      // Mark message as complete
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              text: assistantText || ERROR_TEXT.RESPONSE_COMPLETED,
              status: 'sent' as const,
              isStreaming: false,
              streamingStatus: undefined,
            }
          : msg
      ));
      return { success: true, assistantMessageId };
    } catch (error) {
      const msgText = error instanceof Error ? error.message : '';
      const isAbort = error instanceof Error && error.name === 'AbortError';
      // A connection that dies mid-stream surfaces as a TypeError. Safari reports
      // "Load failed", Chrome "Failed to fetch" — both are treated as drops.
      const isNetworkDrop = !isAbort && (
        error instanceof TypeError ||
        /load failed|failed to fetch|network|the network connection was lost/i.test(msgText)
      );
      // Auto-resume the query after a connection drop — e.g. the computer slept
      // mid-stream and the socket died. We don't gate on a separate "did we wake?"
      // signal because, on wake, the dropped-fetch rejection usually fires before
      // the heartbeat tick runs (a race that was skipping the resume). Any in-flight
      // network drop is recoverable, so we retry it directly (capped + delayed).
      if ((isNetworkDrop || (isAbort && sleepAbortRef.current))
          && retryCountRef.current < MAX_SLEEP_RETRIES) {
        retryCountRef.current += 1;
        sleepAbortRef.current = false;
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, text: '', status: 'thinking' as const, isStreaming: true, streamingStatus: RECONNECTING_STATUS, error: undefined }
            : msg
        ));
        setTimeout(() => {
          sendMessageRef.current?.(message, displayText, isTarget, isAnalysis, category, { retryOfId: assistantMessageId });
        }, SLEEP_RETRY_DELAY_MS);
        return { success: false, error, retrying: true };
      }

      // Handle user-initiated cancel.
      if (isAbort) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: '',
                status: 'error' as const,
                error: `${ERROR_TEXT.ERROR_PREFIX}\n\n${ERROR_TEXT.USER_CANCELED}`,
                isStreaming: false,
                streamingStatus: undefined
              }
            : msg
        ));
      } else {
        // Never surface a raw "Load failed" — show a friendly connection message.
        let errorMessage: string;
        if (isNetworkDrop) {
          // Network error during streaming - format with ERROR_PREFIX and tips
          errorMessage = `${ERROR_TEXT.ERROR_PREFIX}\n\nConnection lost during streaming.\n\n💡 Tip: The backend server at ${config.backendUrl} stopped or crashed, network connection was interrupted, or the backend server is no longer running.`;
        } else {
          // Use fullMessage property to preserve \n\n (Error.message normalizes newlines)
          errorMessage = error instanceof Error ? ((error as any).fullMessage || error.message) : ERROR_TEXT.UNKNOWN_ERROR;
        }

        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
          ? {
              ...msg,
              text: '',
              status: 'error' as const,
              error: errorMessage,
              isStreaming: false,
              streamingStatus: undefined
            }
          : msg
        ));
      }
      return { success: false, error };
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, selectedAgent, onCreditsLeft]);

  // Keep a ref to the latest sendMessage so timers/listeners can resume a query.
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Detect the machine waking from sleep. While suspended the JS event loop is
  // frozen, so a heartbeat interval that "skips" far more than its period means
  // we just woke up. On wake we abort any in-flight stream (its socket is dead)
  // so the catch handler can resume the query cleanly.
  useEffect(() => {
    const HEARTBEAT_MS = 2000;
    const WAKE_WINDOW_MS = 30000;
    let last = Date.now();
    let windowTimer: ReturnType<typeof setTimeout> | null = null;

    const markWoke = () => {
      wokeRecentlyRef.current = true;
      if (windowTimer) clearTimeout(windowTimer);
      windowTimer = setTimeout(() => { wokeRecentlyRef.current = false; }, WAKE_WINDOW_MS);
      // Tear down the now-dead connection so we can reconnect immediately.
      if (abortControllerRef.current) {
        sleepAbortRef.current = true;
        abortControllerRef.current.abort();
      }
    };

    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (gap > HEARTBEAT_MS + 5000) markWoke();
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - last > HEARTBEAT_MS + 5000) markWoke();
        last = now;
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      if (windowTimer) clearTimeout(windowTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current && isLoading) {
      abortControllerRef.current.abort();
    }
  }, [isLoading]);
  const clearMessages = useCallback(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current && isLoading) {
      abortControllerRef.current.abort();
    }

    setMessages([]);
    setIsLoading(false);
    abortControllerRef.current = null;
  }, [isLoading]);
  const submitFeedback = useCallback(async (runId: string, score: number) => {
    try {
      await fetch(`${config.backendUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, score }),
      });
    } catch (e) {
      console.warn('Feedback submission failed:', e);
    }
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    cancelRequest,
    clearMessages,
    submitFeedback,
  };
};
