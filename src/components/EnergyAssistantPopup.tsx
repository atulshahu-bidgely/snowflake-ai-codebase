import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Stack,
  CircularProgress,
  Divider,
  Fab,
  Zoom,
} from '@mui/material';
import {
  Close as CloseIcon,
  AddComment as NewChatIcon,
  Send as SendIcon,
  AutoAwesome as SparkleIcon,
  Search as SearchIcon,
  BarChart as ChartIcon,
  TrackChanges as TargetIcon,
  ChevronRight as ArrowIcon,
  EditOutlined as EditIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useChatMessages } from '../hooks/useChatMessages';
import { useAccordionState } from '../hooks/useAccordionState';
import { ChatMessage } from './chat/ChatMessage';

const FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const GRADIENT = 'linear-gradient(19.5deg, #0f4184 0.2%, #1e62c1 29.9%, #94207b 51.3%, #e4194b 77.1%, #e4194b 102.8%, #f1774a 128.6%)';
const BLUE = '#0c6ae9';
const RED = '#e4194b';

const GOAL_OPTIONS = [
  {
    icon: <SearchIcon sx={{ fontSize: 20, color: BLUE }} />,
    title: 'I want to get some data',
    description: 'Pull metrics, consumption data, or account lists',
    questions: [
      'How many EV customers do I have in my territory?',
      'What is the average monthly consumption for residential AMI customers?',
      'Show me the top accounts by electricity consumption last month',
      'How many customers are enrolled in time-of-use rates?',
      'What percentage of customers have rooftop solar?',
    ],
  },
  {
    icon: <ChartIcon sx={{ fontSize: 20, color: BLUE }} />,
    title: 'I want to analyse consumption patterns',
    description: 'Explore trends, peak usage, and segment behaviour',
    questions: [
      'What are the peak demand hours for the residential segment?',
      'Show me consumption trends over the last 12 months',
      'Which customer segments drive the highest summer peak loads?',
      'How has EV adoption shifted overnight load in my territory?',
      'Compare usage patterns between AMI and non-AMI customers',
    ],
  },
  {
    icon: <TargetIcon sx={{ fontSize: 20, color: BLUE }} />,
    title: 'I want to target candidates for a program',
    description: 'Find eligible accounts for programs or rate plans',
    questions: [
      'I want to plan a weatherisation program and want to target users whose cooling and heating are inefficient',
      'I have a heatpump rebate and need to find the 3000 customers who own their homes, have SF homes, and have the least efficient heating.',
      'Give the top 5 grid assets, whose utilization is very high due to EV charging in peak periods',
    ],
  },
];

const GOAL_PLACEHOLDERS = [
  'What data would you like to pull?',
  'What consumption pattern would you like to explore?',
  'Which program or rate plan are you targeting?',
];

// Goal index 1 = "I want to analyse consumption patterns" → visualization + detail
const ANALYSIS_GOAL_INDEX = 1;

const buildPrompt = (text: string, isAnalysis: boolean): string => {
  if (isAnalysis) {
    return `${text}\n\nIMPORTANT: This is a consumption analysis question. Include a chart or visualization. Provide detailed data with trends, breakdowns, and insights.`;
  }
  return `${text}\n\nIMPORTANT: This is a data retrieval question. Provide the key data values clearly and concisely. Keep visualization minimal.`;
};

export const EnergyAssistantPopup: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { config: agentConfig, loading: configLoading, refreshAgents } = useAgentConfig();

  const agentList = useMemo(() => {
    if (!agentConfig) return [];
    return Object.entries(agentConfig.agents)
      .sort(([, a], [, b]) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()))
      .map(([id, cfg]) => ({ id, displayName: cfg.displayName }));
  }, [agentConfig]);

  const [selectedAgent, setSelectedAgent] = useState<string>('');

  useEffect(() => {
    if (agentList.length > 0 && !selectedAgent) {
      setSelectedAgent(agentList[0].id);
    }
  }, [agentList, selectedAgent]);

  const { messages, isLoading, sendMessage, cancelRequest, clearMessages } =
    useChatMessages(selectedAgent);

  const thinkingAccordion = useAccordionState();
  const chartsAccordion = useAccordionState();
  const annotationsAccordion = useAccordionState();

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  useEffect(() => {
    messages.forEach(msg => {
      if (msg.sender === 'assistant' && msg.status === 'sent' && !msg.isStreaming) {
        thinkingAccordion.collapse(msg.id);
      }
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMessages = useMemo(() =>
    messages.filter(msg => {
      const hasThinking =
        msg.sender === 'assistant' &&
        ((msg.thinkingTexts?.some(t => t.trim().length > 0)) ||
          (msg.sqlQueries && msg.sqlQueries.length > 0));
      return (
        // Show immediately when the assistant is actively processing (even before any content)
        (msg.sender === 'assistant' && msg.isStreaming) ||
        hasThinking ||
        (msg.text && msg.text.trim()) ||
        (msg.status === 'error' && msg.error?.trim())
      );
    }),
    [messages]
  );

  const lastMessageComplete = useMemo(() => {
    const last = visibleMessages[visibleMessages.length - 1];
    return last?.sender === 'assistant' && last?.status === 'sent' && !last?.isStreaming;
  }, [visibleMessages]);

  const isAnalysisGoal = selectedGoal === ANALYSIS_GOAL_INDEX;

  const handleSubmit = useCallback(() => {
    if (isLoading) { cancelRequest(); return; }
    if (!inputText.trim()) return;
    const display = inputText.trim();
    sendMessage(buildPrompt(display, isAnalysisGoal), display);
    setInputText('');
  }, [inputText, isLoading, sendMessage, cancelRequest, isAnalysisGoal]);

  const handleGoalClick = useCallback((index: number) => {
    setSelectedGoal(index);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleQuestionClick = useCallback((text: string) => {
    sendMessage(buildPrompt(text, selectedGoal === ANALYSIS_GOAL_INDEX), text);
  }, [sendMessage, selectedGoal]);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setInputText('');
    setSelectedGoal(null);
    thinkingAccordion.reset();
    chartsAccordion.reset();
    annotationsAccordion.reset();
    refreshAgents();
  }, [clearMessages, refreshAgents, thinkingAccordion, chartsAccordion, annotationsAccordion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <Box
          onClick={() => setOpen(false)}
          sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.4)', zIndex: 1200, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Popup panel */}
      <Box
        sx={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: open
            ? 'translate(-50%, -50%)'
            : 'translate(-50%, -50%) scale(0.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          width: { xs: '97vw', sm: '960px' },
          height: { xs: '92vh', sm: '88vh' },
          maxHeight: 900,
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0px 32px 96px rgba(0,0,0,0.20), 0px 4px 16px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: '12px',
            borderBottom: '1px solid #efefef',
            bgcolor: 'white',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '7px',
                background: GRADIENT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SparkleIcon sx={{ fontSize: 15, color: 'white' }} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#1a1d23', fontFamily: FONT, letterSpacing: '-0.01em' }}>
              Energy Assistant
            </Typography>
            <Box sx={{ bgcolor: '#f0f0f0', borderRadius: '4px', px: '6px', py: '2px' }}>
              <Typography sx={{ fontSize: 10, fontWeight: 500, color: '#888', fontFamily: FONT, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                Beta
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* New Chat button */}
            <Box
              component="button"
              onClick={handleNewChat}
              sx={{
                display: 'flex', alignItems: 'center', gap: '6px',
                cursor: 'pointer',
                border: '1px solid #e8eaed',
                borderRadius: '7px',
                bgcolor: 'transparent',
                px: '10px',
                py: '5px',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: '#f4f6f9', borderColor: '#d0d4db' },
              }}
            >
              <NewChatIcon sx={{ fontSize: 15, color: '#555' }} />
              <Typography sx={{ fontSize: 13, color: '#444', fontFamily: FONT, fontWeight: 500, whiteSpace: 'nowrap' }}>
                New Chat
              </Typography>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: 'center', mx: 0.5 }} />

            <IconButton
              size="small"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              sx={{ color: '#666', p: '5px', borderRadius: '7px', '&:hover': { bgcolor: '#f4f6f9', color: '#333' } }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        {/* ── Persistent goal bar ───────────────────────────── */}
        {selectedGoal !== null && (
          <Box
            sx={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: { xs: 3, sm: '32px' }, py: '8px',
              bgcolor: `${BLUE}06`,
              borderBottom: `1px solid ${BLUE}18`,
            }}
          >
            <Box sx={{
              width: 24, height: 24, borderRadius: '5px',
              bgcolor: `${BLUE}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {React.cloneElement(GOAL_OPTIONS[selectedGoal].icon as React.ReactElement, { sx: { fontSize: 13, color: BLUE } })}
            </Box>
            <Typography sx={{ fontSize: 11, color: '#999', fontFamily: FONT, whiteSpace: 'nowrap', fontWeight: 500 }}>
              Goal
            </Typography>
            <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600, color: BLUE, fontFamily: FONT, minWidth: 0, letterSpacing: '-0.01em' }} noWrap>
              {GOAL_OPTIONS[selectedGoal].title}
            </Typography>
            <Box
              component="button"
              onClick={handleNewChat}
              sx={{
                display: 'flex', alignItems: 'center', gap: '4px',
                cursor: 'pointer',
                border: 'none', bgcolor: 'transparent',
                flexShrink: 0,
                p: '3px 6px',
                borderRadius: '4px',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: `${BLUE}10` },
              }}
            >
              <EditIcon sx={{ fontSize: 12, color: '#999' }} />
              <Typography sx={{ fontSize: 12, color: '#999', fontFamily: FONT }}>Change</Typography>
            </Box>
          </Box>
        )}

        {/* ── Body ─────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {configLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexDirection: 'column' }}>
              <CircularProgress size={28} sx={{ color: BLUE }} />
              <Typography sx={{ fontSize: 13, color: '#aaa', fontFamily: FONT }}>Loading agents…</Typography>
            </Box>

          ) : visibleMessages.length === 0 ? (
            // ── Empty / onboarding state ──────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

              {selectedGoal === null ? (
                // ── Goal picker ───────────────────────────────
                <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 3, sm: '80px' }, pt: '44px', pb: 3, display: 'flex', flexDirection: 'column', gap: '28px' }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography
                      sx={{
                        fontSize: { xs: 24, sm: 30 },
                        fontWeight: 700,
                        background: GRADIENT,
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontFamily: FONT,
                        lineHeight: 1.2,
                        letterSpacing: '-0.03em',
                        mb: 0.5,
                      }}
                    >
                      What do you want to do today?
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: '#aaa', fontFamily: FONT }}>
                      Choose a goal to get started with suggested questions
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {GOAL_OPTIONS.map((opt, i) => (
                      <Box
                        key={i}
                        component="button"
                        onClick={() => handleGoalClick(i)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 2,
                          p: '16px 18px',
                          bgcolor: 'white',
                          border: '1.5px solid #e8eaed',
                          borderLeft: '3px solid transparent',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.16s ease',
                          '&:hover': {
                            borderColor: `${BLUE}50`,
                            borderLeft: `3px solid ${BLUE}`,
                            bgcolor: `${BLUE}04`,
                            boxShadow: `0 2px 16px ${BLUE}14`,
                            '& .goal-arrow': { opacity: 1, transform: 'translateX(2px)' },
                            '& .goal-icon-box': { bgcolor: `${BLUE}20` },
                          },
                        }}
                      >
                        <Box
                          className="goal-icon-box"
                          sx={{
                            width: 40, height: 40,
                            borderRadius: '9px',
                            bgcolor: `${BLUE}10`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'background-color 0.16s ease',
                          }}
                        >
                          {opt.icon}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1a1d23', fontFamily: FONT, letterSpacing: '-0.01em', mb: '2px' }}>
                            {opt.title}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: '#7a8096', fontFamily: FONT, lineHeight: 1.4 }}>
                            {opt.description}
                          </Typography>
                        </Box>
                        <ArrowIcon
                          className="goal-arrow"
                          sx={{ fontSize: 18, color: '#c8cdd8', flexShrink: 0, opacity: 0.6, transition: 'all 0.16s ease' }}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>

              ) : (
                // ── Suggested questions ────────────────────────
                <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 3, sm: '48px' }, py: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#b0b8c8', fontFamily: FONT, mb: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Suggested questions
                  </Typography>

                  {GOAL_OPTIONS[selectedGoal].questions.map((q, i) => (
                    <Box
                      key={i}
                      component="button"
                      onClick={() => handleQuestionClick(q)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        px: '16px', py: '12px',
                        bgcolor: 'white',
                        border: '1.5px solid #e8eaed',
                        borderLeft: '3px solid transparent',
                        borderRadius: '9px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          bgcolor: `${BLUE}05`,
                          borderColor: `${BLUE}40`,
                          borderLeft: `3px solid ${BLUE}`,
                          '& .q-arrow': { opacity: 1, transform: 'translateX(3px)' },
                        },
                      }}
                    >
                      <SparkleIcon sx={{ fontSize: 13, color: BLUE, flexShrink: 0, opacity: 0.75 }} />
                      <Typography sx={{ flex: 1, fontSize: 13.5, color: '#2a2e3a', fontFamily: FONT, lineHeight: 1.45, fontWeight: 400 }}>
                        {q}
                      </Typography>
                      <ArrowIcon
                        className="q-arrow"
                        sx={{ fontSize: 16, color: '#c0c6d4', flexShrink: 0, opacity: 0, transition: 'all 0.15s ease' }}
                      />
                    </Box>
                  ))}
                </Box>
              )}

              {/* Input — always at bottom of empty state */}
              <Box sx={{ px: { xs: 3, sm: '48px' }, pb: 3, pt: 1.5, flexShrink: 0, borderTop: '1px solid #f0f0f0', bgcolor: 'white' }}>
                <InputBox
                  inputRef={inputRef}
                  value={inputText}
                  onChange={setInputText}
                  onKeyDown={handleKeyDown}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                  height={selectedGoal === null ? 68 : 52}
                  placeholder={selectedGoal !== null ? GOAL_PLACEHOLDERS[selectedGoal] : 'Ask a question about your energy data…'}
                />
                <Typography sx={{ fontSize: 11, color: '#333', opacity: 0.22, textAlign: 'center', mt: 1.25, fontFamily: FONT }}>
                  AI may occasionally make mistakes. Verify important numbers independently.
                </Typography>
              </Box>
            </Box>

          ) : (
            // ── Chat state ──────────────────────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {/* Scrollable messages */}
              <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5, bgcolor: '#f7f8fb' }}>
                <Stack spacing={2.5}>
                  {visibleMessages.map(msg => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      collapsedThinking={thinkingAccordion.isCollapsed(msg.id)}
                      collapsedCharts={chartsAccordion.isCollapsed(msg.id)}
                      collapsedAnnotations={annotationsAccordion.isCollapsed(msg.id)}
                      onToggleThinking={thinkingAccordion.toggle}
                      onToggleCharts={chartsAccordion.toggle}
                      onToggleAnnotations={annotationsAccordion.toggle}
                      onResendMessage={sendMessage}
                    />
                  ))}
                </Stack>

                {/* Follow-up chips */}
                {lastMessageComplete && selectedGoal !== null && (
                  <Box sx={{ mt: 3, mb: 1 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#b0b8c8', fontFamily: FONT, mb: 1.5, pl: '2px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Follow-up questions
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {GOAL_OPTIONS[selectedGoal].questions.map((q, i) => (
                        <Box
                          key={i}
                          onClick={() => handleQuestionClick(q)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            px: '12px', py: '7px',
                            bgcolor: 'white',
                            border: `1.5px solid ${BLUE}28`,
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: 12.5,
                            color: '#2a2e3a',
                            fontFamily: FONT,
                            fontWeight: 400,
                            transition: 'all 0.15s',
                            '&:hover': {
                              bgcolor: `${BLUE}08`,
                              borderColor: `${BLUE}60`,
                              color: BLUE,
                            },
                          }}
                        >
                          <SparkleIcon sx={{ fontSize: 11, color: BLUE }} />
                          {q}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                <div ref={messagesEndRef} />
              </Box>

              {/* Sticky input */}
              <Box sx={{ px: 3, py: '14px', borderTop: '1px solid #efefef', bgcolor: 'white', flexShrink: 0 }}>
                <InputBox
                  value={inputText}
                  onChange={setInputText}
                  onKeyDown={handleKeyDown}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                  height={52}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* FAB trigger */}
      <Zoom in={!open}>
        <Fab
          onClick={() => setOpen(true)}
          aria-label="Open Energy Assistant"
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            background: GRADIENT,
            color: 'white',
            zIndex: 1200,
            width: 56,
            height: 56,
            boxShadow: '0px 6px 24px rgba(12,106,233,0.45)',
            '&:hover': { opacity: 0.92, background: GRADIENT, boxShadow: '0px 8px 32px rgba(12,106,233,0.55)' },
          }}
        >
          <SparkleIcon sx={{ fontSize: 24 }} />
        </Fab>
      </Zoom>
    </>
  );
};

// ── Input box ─────────────────────────────────────────────────

interface InputBoxProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  isLoading: boolean;
  height: number;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

const InputBox: React.FC<InputBoxProps> = ({
  value, onChange, onKeyDown, onSend, isLoading, height,
  placeholder = 'Ask a question…',
  inputRef,
}) => (
  <Box
    sx={{
      width: '100%',
      height,
      border: `1.5px solid ${isLoading ? RED + '50' : '#d8dbe2'}`,
      borderRadius: '10px',
      boxShadow: isLoading
        ? `0 0 0 3px ${RED}14`
        : '0px 1px 6px rgba(40,41,61,0.05)',
      bgcolor: 'white',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      '&:focus-within': {
        borderColor: isLoading ? RED + '70' : BLUE,
        boxShadow: `0 0 0 3px ${isLoading ? RED : BLUE}18`,
      },
    }}
  >
    <TextField
      fullWidth
      multiline={height >= 60}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={isLoading}
      variant="standard"
      inputRef={inputRef}
      sx={{
        position: 'absolute',
        inset: 0,
        '& .MuiInputBase-root': {
          height: '100%',
          alignItems: 'flex-start',
          px: '14px',
          pt: height >= 60 ? '12px' : '0px',
          fontFamily: FONT,
          fontSize: 14,
          color: '#1a1d23',
        },
        '& .MuiInputBase-input::placeholder': {
          color: '#b0b8c8',
          opacity: 1,
        },
        '& .MuiInput-underline:before': { display: 'none' },
        '& .MuiInput-underline:after': { display: 'none' },
        '& textarea': { resize: 'none' },
      }}
    />

    {/* Send / Stop button */}
    <Box
      component="button"
      onClick={onSend}
      aria-label={isLoading ? 'Stop generating' : 'Send message'}
      disabled={!isLoading && !value.trim()}
      sx={{
        position: 'absolute',
        bottom: height >= 60 ? 8 : '50%',
        transform: height >= 60 ? 'none' : 'translateY(50%)',
        right: 8,
        width: 34,
        height: 34,
        bgcolor: isLoading ? '#fff2f2' : !value.trim() ? '#f4f6f9' : BLUE,
        borderRadius: '8px',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: !isLoading && !value.trim() ? 'default' : 'pointer',
        transition: 'all 0.15s',
        '&:hover:not(:disabled)': {
          bgcolor: isLoading ? '#ffe0e0' : !value.trim() ? '#f4f6f9' : `${BLUE}dd`,
          transform: height >= 60 ? 'scale(1.05)' : 'translateY(50%) scale(1.05)',
        },
        '&:active:not(:disabled)': {
          transform: height >= 60 ? 'scale(0.97)' : 'translateY(50%) scale(0.97)',
        },
      }}
    >
      {isLoading
        ? <StopIcon sx={{ fontSize: 15, color: RED }} />
        : <SendIcon sx={{ fontSize: 15, color: value.trim() ? 'white' : '#c8cdd8', transform: 'rotate(-45deg)', transition: 'color 0.15s' }} />
      }
    </Box>
  </Box>
);
