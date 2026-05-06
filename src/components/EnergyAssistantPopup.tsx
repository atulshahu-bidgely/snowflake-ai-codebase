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
  History as HistoryIcon,
  Send as SendIcon,
  AutoAwesome as SparkleIcon,
  AddComment as NewChatIcon,
  ChevronRight as ArrowIcon,
  Search as SearchIcon,
  BarChart as ChartIcon,
  TrackChanges as TargetIcon,
  EditOutlined as EditIcon,
} from '@mui/icons-material';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useChatMessages } from '../hooks/useChatMessages';
import { useAccordionState } from '../hooks/useAccordionState';
import { ChatMessage } from './chat/ChatMessage';

const GRADIENT =
  'linear-gradient(19.5deg, #0f4184 0.2%, #1e62c1 29.9%, #94207b 51.3%, #e4194b 77.1%, #e4194b 102.8%, #f1774a 128.6%)';
const BLUE = '#0c6ae9';
const RED = '#e4194b';

const GOAL_OPTIONS = [
  {
    icon: <SearchIcon sx={{ fontSize: 22, color: BLUE }} />,
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
    icon: <ChartIcon sx={{ fontSize: 22, color: BLUE }} />,
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
    icon: <TargetIcon sx={{ fontSize: 22, color: BLUE }} />,
    title: 'I want to target candidates for a specific program/rate',
    description: 'Find eligible accounts for programs or rate plans',
    questions: [
      'I want to plan a weatherisation program and want to target users whose cooling and heating are inefficient',
      'I have a heatpump rebate and need to find the 3000 customers who own their homes, have SF homes, and have the least efficient heating. Can you generate a list of customers and show their monthly average heating consumption?',
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

  // Agent list sorted alphabetically
  const agentList = useMemo(() => {
    if (!agentConfig) return [];
    return Object.entries(agentConfig.agents)
      .sort(([, a], [, b]) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()))
      .map(([id, cfg]) => ({ id, displayName: cfg.displayName }));
  }, [agentConfig]);

  const [selectedAgent, setSelectedAgent] = useState<string>('');

  // Set default agent once loaded
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

  // Auto-scroll
  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Collapse thinking/sql on completion
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
  }, []);

  const handleQuestionClick = useCallback((text: string) => {
    sendMessage(buildPrompt(text, selectedGoal === ANALYSIS_GOAL_INDEX), text);
  }, [sendMessage, selectedGoal]);

  const handleAgentSwitch = useCallback((agentId: string) => {
    if (agentId === selectedAgent) return;
    setSelectedAgent(agentId);
    clearMessages();
    setInputText('');
    setSelectedGoal(null);
    thinkingAccordion.reset();
    chartsAccordion.reset();
    annotationsAccordion.reset();
  }, [selectedAgent, clearMessages, thinkingAccordion, chartsAccordion, annotationsAccordion]); // eslint-disable-line react-hooks/exhaustive-deps

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
          sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.35)', zIndex: 1200 }}
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
            : 'translate(-50%, -50%) scale(0.96)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          width: { xs: '97vw', sm: '960px' },
          height: { xs: '92vh', sm: '88vh' },
          maxHeight: 900,
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#fefefd',
          borderRadius: '12px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0px 24px 80px rgba(0,0,0,0.22)',
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
            py: '14px',
            borderBottom: '1px solid #f0f0f0',
            bgcolor: 'white',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SparkleIcon sx={{ fontSize: 18, color: BLUE }} />
            <Typography sx={{ fontSize: 16, color: '#333', fontFamily: 'Roboto, sans-serif' }}>
              Energy Assistant
            </Typography>
            <Box sx={{ bgcolor: '#f6f6f6', borderRadius: '2px', px: '4px', py: '1px' }}>
              <Typography sx={{ fontSize: 11, color: '#616f89', fontFamily: 'Roboto, sans-serif' }}>
                Beta
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              onClick={handleNewChat}
              sx={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
            >
              <HistoryIcon sx={{ fontSize: 18, color: '#555' }} />
              <Typography sx={{ fontSize: 13, color: '#555', fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }}>
                Chat History
              </Typography>
            </Box>
            <Box
              onClick={handleNewChat}
              sx={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
            >
              <NewChatIcon sx={{ fontSize: 18, color: '#555' }} />
              <Typography sx={{ fontSize: 13, color: '#555', fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }}>
                New Chat
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#555', p: 0.25 }}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        {/* ── Persistent goal bar ───────────────────────────── */}
        {selectedGoal !== null && (
          <Box
            sx={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: { xs: 3, sm: '32px' }, py: '9px',
              bgcolor: `${BLUE}07`,
              borderBottom: `1px solid ${BLUE}22`,
            }}
          >
            <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: `${BLUE}16`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {React.cloneElement(GOAL_OPTIONS[selectedGoal].icon as React.ReactElement, { sx: { fontSize: 15, color: BLUE } })}
            </Box>
            <Typography sx={{ fontSize: 12, color: '#888', fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }}>
              Goal:
            </Typography>
            <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600, color: BLUE, fontFamily: 'Roboto, sans-serif', minWidth: 0 }} noWrap>
              {GOAL_OPTIONS[selectedGoal].title}
            </Typography>
            <Box
              onClick={handleNewChat}
              sx={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', flexShrink: 0, '&:hover': { opacity: 0.7 } }}
            >
              <EditIcon sx={{ fontSize: 13, color: '#888' }} />
              <Typography sx={{ fontSize: 12, color: '#888', fontFamily: 'Roboto, sans-serif' }}>Change</Typography>
            </Box>
          </Box>
        )}

        {/* ── Body ─────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {configLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={32} sx={{ color: BLUE }} />
            </Box>

          ) : visibleMessages.length === 0 ? (
            // ── Empty / onboarding state ────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

              {selectedGoal === null ? (
                // ── Goal picker (full, scrollable) ────────────
                <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 3, sm: '80px' }, pt: '48px', pb: 3, display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  <Typography
                    sx={{
                      fontSize: { xs: 26, sm: 34 },
                      fontWeight: 700,
                      textAlign: 'center',
                      background: GRADIENT,
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontFamily: 'Roboto, sans-serif',
                      lineHeight: 1.25,
                    }}
                  >
                    What do you want to do today?
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {GOAL_OPTIONS.map((opt, i) => (
                      <Box
                        key={i}
                        onClick={() => handleGoalClick(i)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 2,
                          p: '16px 20px',
                          bgcolor: 'white', border: '1px solid #eaedf6',
                          borderRadius: '10px', cursor: 'pointer',
                          transition: 'all 0.15s',
                          '&:hover': {
                            borderColor: `${BLUE}60`,
                            boxShadow: `0 2px 12px ${BLUE}18`,
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: `${BLUE}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {opt.icon}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#1e232e', fontFamily: 'Roboto, sans-serif' }}>
                            {opt.title}
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: '#727888', fontFamily: 'Roboto, sans-serif', mt: '2px' }}>
                            {opt.description}
                          </Typography>
                        </Box>
                        <ArrowIcon sx={{ fontSize: 20, color: '#c0c6d4', flexShrink: 0 }} />
                      </Box>
                    ))}
                  </Box>
                </Box>

              ) : (
                // ── Goal selected: question list ─
                <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 3, sm: '48px' }, py: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Typography sx={{ fontSize: 12, color: '#aaa', fontFamily: 'Roboto, sans-serif', mb: 1 }}>
                    Suggested questions
                  </Typography>

                  {GOAL_OPTIONS[selectedGoal].questions.map((q, i) => (
                    <Box
                      key={i}
                      onClick={() => handleQuestionClick(q)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        px: '16px', py: '13px',
                        bgcolor: 'white', border: '1px solid #eaedf6',
                        borderRadius: '8px', cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: '#f2f8fe', borderColor: `${BLUE}40`, transform: 'translateX(3px)' },
                      }}
                    >
                      <SparkleIcon sx={{ fontSize: 14, color: BLUE, flexShrink: 0 }} />
                      <Typography sx={{ flex: 1, fontSize: 14, color: '#1e232e', fontFamily: 'Roboto, sans-serif', lineHeight: 1.4 }}>
                        {q}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Input — always at bottom */}
              <Box sx={{ px: { xs: 3, sm: '48px' }, pb: 3, pt: 1.5, flexShrink: 0, borderTop: '1px solid #f0f0f0', bgcolor: 'white' }}>
                <InputBox
                  inputRef={inputRef}
                  value={inputText}
                  onChange={setInputText}
                  onKeyDown={handleKeyDown}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                  height={selectedGoal === null ? 72 : 56}
                  placeholder={selectedGoal !== null ? GOAL_PLACEHOLDERS[selectedGoal] : 'Ask a question…'}
                />
                <Typography sx={{ fontSize: 11, color: '#333', opacity: 0.25, textAlign: 'center', mt: 1.5, fontFamily: 'Roboto, sans-serif' }}>
                  Energy Assistant is an AI and may occasionally make mistakes.
                </Typography>
              </Box>
            </Box>

          ) : (
            // ── Chat state ─────────────────────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {/* Scrollable messages */}
              <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5, bgcolor: '#f8f9fc' }}>
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

                {/* Follow-up question chips — shown after last assistant response completes */}
                {lastMessageComplete && selectedGoal !== null && (
                  <Box sx={{ mt: 2.5, mb: 1 }}>
                    <Typography sx={{ fontSize: 11, color: '#aaa', fontFamily: 'Roboto, sans-serif', mb: 1.5, pl: '2px' }}>
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
                            bgcolor: 'white', border: `1px solid ${BLUE}30`,
                            borderRadius: '20px', cursor: 'pointer',
                            fontSize: 13, color: '#1e232e',
                            fontFamily: 'Roboto, sans-serif',
                            transition: 'all 0.15s',
                            '&:hover': { bgcolor: `${BLUE}08`, borderColor: `${BLUE}70` },
                          }}
                        >
                          <SparkleIcon sx={{ fontSize: 12, color: BLUE }} />
                          {q}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                <div ref={messagesEndRef} />
              </Box>

              {/* Sticky input */}
              <Box sx={{ px: 3, pt: 1.5, pb: 2, borderTop: '1px solid #eee', bgcolor: 'white', flexShrink: 0 }}>
                <InputBox
                  value={inputText}
                  onChange={setInputText}
                  onKeyDown={handleKeyDown}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                  height={56}
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
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            background: GRADIENT,
            color: 'white',
            zIndex: 1200,
            width: 56,
            height: 56,
            boxShadow: '0px 4px 20px rgba(12,106,233,0.4)',
            '&:hover': { opacity: 0.9, background: GRADIENT },
          }}
        >
          <SparkleIcon sx={{ fontSize: 24 }} />
        </Fab>
      </Zoom>
    </>
  );
};

// ── Shared input box ──────────────────────────────────────

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

const InputBox: React.FC<InputBoxProps> = ({ value, onChange, onKeyDown, onSend, isLoading, height, placeholder = 'Ask a question…', inputRef }) => (
  <Box
    sx={{
      width: '100%',
      height,
      border: `1.5px solid ${isLoading ? RED + '60' : BLUE + '50'}`,
      borderRadius: '10px',
      boxShadow: '0px 1px 8px rgba(40,41,61,0.06)',
      bgcolor: 'white',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
      '&:focus-within': { borderColor: BLUE },
    }}
  >
    <TextField
      fullWidth
      multiline={height >= 60}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
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
          fontFamily: 'Roboto, sans-serif',
          fontSize: 15,
          color: '#333',
        },
        '& .MuiInput-underline:before': { display: 'none' },
        '& .MuiInput-underline:after': { display: 'none' },
        '& textarea': { resize: 'none' },
      }}
    />
    <Box
      onClick={onSend}
      sx={{
        position: 'absolute',
        bottom: height >= 60 ? 8 : '50%',
        transform: height >= 60 ? 'none' : 'translateY(50%)',
        right: 8,
        width: 36,
        height: 36,
        bgcolor: isLoading ? '#fff0f0' : `${BLUE}18`,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 0.15s',
        '&:hover': { bgcolor: isLoading ? '#ffe0e0' : `${BLUE}28` },
      }}
    >
      {isLoading
        ? <Box sx={{ width: 12, height: 12, bgcolor: RED, borderRadius: '2px' }} />
        : <SendIcon sx={{ fontSize: 18, color: BLUE, transform: 'rotate(-45deg)' }} />
      }
    </Box>
  </Box>
);
