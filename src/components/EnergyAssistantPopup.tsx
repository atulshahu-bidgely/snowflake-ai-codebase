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
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Close as CloseIcon,
  AddComment as NewChatIcon,
  Send as SendIcon,
  AutoAwesome as SparkleIcon,
  Search as SearchIcon,
  BarChart as ChartIcon,
  TrackChanges as TargetIcon,
  ArrowBack as BackIcon,
  ChevronRight as ArrowIcon,
  Stop as StopIcon,
  ExpandMore as ExpandMoreIcon,
  Storage as AgentIcon,
} from '@mui/icons-material';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useChatMessages } from '../hooks/useChatMessages';
import { useAccordionState } from '../hooks/useAccordionState';
import { ChatMessage } from './chat/ChatMessage';

const FONT     = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const GRADIENT = 'linear-gradient(135deg, #0f4184 0%, #1e62c1 28%, #94207b 55%, #e4194b 80%, #f1774a 100%)';
const BLUE     = '#0c6ae9';
const RED      = '#e4194b';

const CATEGORIES = [
  {
    Icon: SearchIcon,
    label: 'Get Data',
    description: 'Pull metrics, counts, and account lists from your energy data',
    color: '#2563EB',
    bg: '#EFF6FF',
    isAnalysis: false,
    questions: [
      'How many EVs are there in the region?',
      'How many users are enrolled in the Cooling DR Program?',
      'How many users have Solar installed in their houses?',
      'How many users have EV Charger amplitude greater than 3 kW?',
    ],
  },
  {
    Icon: ChartIcon,
    label: 'Analyse Trends',
    description: 'Explore consumption patterns, trends, and segment behaviour',
    color: '#7C3AED',
    bg: '#F5F3FF',
    isAnalysis: true,
    questions: [
      'How has the EV ownership trend changed across the region?',
      'Which time period has the most frequent EV Charging?',
      'Which region has the lowest Area Median Income and highest number of inefficient appliances?',
    ],
  },
  {
    Icon: TargetIcon,
    label: 'Target Programs',
    description: 'Find eligible accounts for programs, rebates, or rate plans',
    color: '#059669',
    bg: '#ECFDF5',
    isAnalysis: false,
    questions: [
      'Target users with inefficient cooling and heating for weatherisation',
      'Find 3,000 customers for a heatpump rebate with least efficient heating',
      'Top 5 grid assets with high EV charging utilization in peak periods',
    ],
  },
];

const buildPrompt = (text: string, isAnalysis: boolean): string => {
  if (isAnalysis) {
    return `${text}\n\nIMPORTANT: This is a consumption analysis question. Include a chart or visualization. Provide detailed data with trends, breakdowns, and insights.`;
  }
  return `${text}\n\nIMPORTANT: This is a data retrieval question. Provide the key data values clearly and concisely. Keep visualization minimal.`;
};

export const EnergyAssistantPopup: React.FC = () => {
  const [open, setOpen]                         = useState(false);
  const [inputText, setInputText]               = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const inputRef                                = useRef<HTMLInputElement>(null);
  const messagesEndRef                          = useRef<HTMLDivElement>(null);

  const { config: agentConfig, loading: configLoading, refreshAgents } = useAgentConfig();

  const agentList = useMemo(() => {
    if (!agentConfig) return [];
    return Object.entries(agentConfig.agents)
      .sort(([, a], [, b]) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()))
      .map(([id, cfg]) => ({ id, displayName: cfg.displayName }));
  }, [agentConfig]);

  const [selectedAgent, setSelectedAgent]       = useState<string>('');
  const [agentMenuAnchor, setAgentMenuAnchor]   = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (agentList.length > 0 && !selectedAgent) setSelectedAgent(agentList[0].id);
  }, [agentList, selectedAgent]);

  const agentStarterQuestions = useMemo(() => {
    if (!agentConfig || !selectedAgent) return [];
    return agentConfig.agents[selectedAgent]?.starterQuestions ?? [];
  }, [agentConfig, selectedAgent]);

  const { messages, isLoading, sendMessage, cancelRequest, clearMessages } =
    useChatMessages(selectedAgent);

  const thinkingAccordion    = useAccordionState();
  const chartsAccordion      = useAccordionState();
  const annotationsAccordion = useAccordionState();

  useEffect(() => {
    if (open && messagesEndRef.current)
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    messages.forEach(msg => {
      if (msg.sender === 'assistant' && msg.status === 'sent' && !msg.isStreaming)
        thinkingAccordion.collapse(msg.id);
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMessages = useMemo(() =>
    messages.filter(msg => {
      const hasThinking =
        msg.sender === 'assistant' &&
        ((msg.thinkingTexts?.some(t => t.trim().length > 0)) ||
         (msg.sqlQueries && msg.sqlQueries.length > 0));
      return (
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

  const isAnalysis = selectedCategory !== null
    ? CATEGORIES[selectedCategory].isAnalysis
    : false;

  const handleSubmit = useCallback(() => {
    if (isLoading) { cancelRequest(); return; }
    if (!inputText.trim()) return;
    const display = inputText.trim();
    sendMessage(buildPrompt(display, isAnalysis), display);
    setInputText('');
  }, [inputText, isLoading, sendMessage, cancelRequest, isAnalysis]);

  const handleQuestionClick = useCallback((text: string, catIsAnalysis: boolean) => {
    sendMessage(buildPrompt(text, catIsAnalysis), text);
  }, [sendMessage]);

  const handleCategoryClick = useCallback((index: number) => {
    setSelectedCategory(index);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setInputText('');
    setSelectedCategory(null);
    thinkingAccordion.reset();
    chartsAccordion.reset();
    annotationsAccordion.reset();
    refreshAgents();
  }, [clearMessages, refreshAgents, thinkingAccordion, chartsAccordion, annotationsAccordion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const activeCat = selectedCategory !== null ? CATEGORIES[selectedCategory] : null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <Box
          onClick={() => setOpen(false)}
          sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.42)', zIndex: 1200, backdropFilter: 'blur(3px)' }}
        />
      )}

      {/* Panel */}
      <Box
        sx={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: open ? 'translate(-50%, -50%)' : 'translate(-50%, -50%) scale(0.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          width: { xs: '97vw', sm: '960px' },
          height: { xs: '92vh', sm: '88vh' },
          maxHeight: 900,
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0px 32px 96px rgba(0,0,0,0.22), 0px 4px 20px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Brand stripe */}
        <Box sx={{ height: 3, background: GRADIENT, flexShrink: 0 }} />

        {/* ── Header ─────────────────────────────────────────── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 3, py: '11px',
          borderBottom: '1px solid #f0f2f5',
          bgcolor: 'white', flexShrink: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{
              width: 28, height: 28, borderRadius: '7px', background: GRADIENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SparkleIcon sx={{ fontSize: 15, color: 'white' }} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#1a1d23', fontFamily: FONT, letterSpacing: '-0.01em' }}>
              Energy Analyzer
            </Typography>
            <Box sx={{ bgcolor: '#f0f0f0', borderRadius: '4px', px: '6px', py: '2px' }}>
              <Typography sx={{ fontSize: 10, fontWeight: 500, color: '#888', fontFamily: FONT, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                Beta
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>

            {/* Agent switcher */}
            {agentList.length > 0 && (
              <>
                <Box
                  component="button"
                  onClick={e => setAgentMenuAnchor(e.currentTarget as HTMLElement)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    cursor: 'pointer', border: '1px solid #e8eaed', borderRadius: '7px',
                    bgcolor: 'transparent', px: '10px', py: '5px',
                    maxWidth: 200,
                    transition: 'all 0.15s',
                    '&:hover': { bgcolor: '#f4f6f9', borderColor: '#d0d4db' },
                  }}
                >
                  <AgentIcon sx={{ fontSize: 13, color: BLUE, flexShrink: 0 }} />
                  <Typography sx={{
                    fontSize: 13, color: '#444', fontFamily: FONT, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {agentList.find(a => a.id === selectedAgent)?.displayName ?? 'Select agent'}
                  </Typography>
                  <ExpandMoreIcon sx={{ fontSize: 14, color: '#999', flexShrink: 0 }} />
                </Box>
                <Menu
                  anchorEl={agentMenuAnchor}
                  open={Boolean(agentMenuAnchor)}
                  onClose={() => setAgentMenuAnchor(null)}
                  slotProps={{ paper: { sx: { mt: '6px', minWidth: 200, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid #e8eaed' } } }}
                >
                  {agentList.map(agent => (
                    <MenuItem
                      key={agent.id}
                      selected={agent.id === selectedAgent}
                      onClick={() => { setSelectedAgent(agent.id); setAgentMenuAnchor(null); }}
                      sx={{
                        fontSize: 13, fontFamily: FONT, borderRadius: '6px', mx: '4px',
                        '&.Mui-selected': { bgcolor: `${BLUE}0f`, color: BLUE, fontWeight: 600 },
                        '&.Mui-selected:hover': { bgcolor: `${BLUE}18` },
                      }}
                    >
                      {agent.displayName}
                    </MenuItem>
                  ))}
                </Menu>
                <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: 'center' }} />
              </>
            )}

            <Box
              component="button"
              onClick={handleNewChat}
              sx={{
                display: 'flex', alignItems: 'center', gap: '6px',
                cursor: 'pointer', border: '1px solid #e8eaed', borderRadius: '7px',
                bgcolor: 'transparent', px: '10px', py: '5px',
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
              size="small" onClick={() => setOpen(false)} aria-label="Close"
              sx={{ color: '#666', p: '5px', borderRadius: '7px', '&:hover': { bgcolor: '#f4f6f9', color: '#333' } }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        {/* ── Body ──────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          {configLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
              <CircularProgress size={28} sx={{ color: BLUE }} />
              <Typography sx={{ fontSize: 13, color: '#aaa', fontFamily: FONT }}>Loading agents…</Typography>
            </Box>

          ) : visibleMessages.length === 0 ? (

            // ── Empty state ────────────────────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              <Box sx={{
                flex: 1, overflowY: 'auto', minHeight: 0,
                px: { xs: 2.5, sm: '48px' },
                background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(37,99,235,0.05) 0%, transparent 70%)',
              }}>

                {/* Hero */}
                <Box sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  pt: { xs: '28px', sm: '44px' }, pb: { xs: '24px', sm: '32px' },
                }}>
                  <Box sx={{ position: 'relative', mb: '18px' }}>
                    <Box sx={{
                      position: 'absolute', inset: -10, borderRadius: '26px',
                      background: 'radial-gradient(ellipse, rgba(37,99,235,0.16) 0%, transparent 70%)',
                    }} />
                    <Box sx={{
                      position: 'relative',
                      width: 56, height: 56, borderRadius: '16px', background: GRADIENT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 10px 32px rgba(14,106,233,0.3)',
                    }}>
                      <SparkleIcon sx={{ fontSize: 28, color: 'white' }} />
                    </Box>
                  </Box>

                  <Typography sx={{
                    fontSize: { xs: 24, sm: 32 }, fontWeight: 700,
                    background: GRADIENT, backgroundClip: 'text',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    fontFamily: FONT, letterSpacing: '-0.035em', lineHeight: 1.15,
                    textAlign: 'center', mb: '10px',
                  }}>
                    What would you like to do today?
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: '#94a3b8', fontFamily: FONT, textAlign: 'center' }}>
                    Choose a goal to get started
                  </Typography>
                </Box>

                {/* ── Step 1: Goal grid ─────────────────────── */}
                {selectedCategory === null && (
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                    gap: { xs: '14px', sm: '16px' },
                    pb: 3,
                  }}>
                    {CATEGORIES.map((cat, ci) => (
                      <Box
                        key={ci}
                        component="button"
                        onClick={() => handleCategoryClick(ci)}
                        sx={{
                          display: 'flex', flexDirection: 'column',
                          p: '22px 20px',
                          bgcolor: 'white',
                          border: '1.5px solid #e8edf4',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.18s ease',
                          '&:hover': {
                            borderColor: `${cat.color}50`,
                            boxShadow: `0 6px 24px ${cat.color}18`,
                            transform: 'translateY(-2px)',
                            '& .cat-arrow': { opacity: 1, transform: 'translateX(3px)' },
                            '& .cat-icon-box': { bgcolor: cat.bg, transform: 'scale(1.08)' },
                          },
                          '&:active': { transform: 'translateY(0)' },
                        }}
                      >
                        {/* Icon + arrow row */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: '14px' }}>
                          <Box
                            className="cat-icon-box"
                            sx={{
                              width: 44, height: 44, borderRadius: '12px',
                              bgcolor: `${cat.color}14`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.18s ease',
                            }}
                          >
                            <cat.Icon sx={{ fontSize: 22, color: cat.color }} />
                          </Box>
                          <ArrowIcon
                            className="cat-arrow"
                            sx={{
                              fontSize: 18, color: '#c8d0dc',
                              opacity: 0, transition: 'all 0.18s ease', mt: '4px',
                            }}
                          />
                        </Box>

                        {/* Label */}
                        <Typography sx={{
                          fontSize: 15, fontWeight: 700, color: '#1a1d23',
                          fontFamily: FONT, letterSpacing: '-0.02em', mb: '6px',
                        }}>
                          {cat.label}
                        </Typography>

                        {/* Description */}
                        <Typography sx={{
                          fontSize: 12.5, color: '#8492a6', fontFamily: FONT,
                          lineHeight: 1.55, fontWeight: 400,
                        }}>
                          {cat.description}
                        </Typography>

                        {/* Question count badge */}
                        <Box sx={{
                          display: 'inline-flex', alignItems: 'center',
                          mt: '14px', px: '8px', py: '3px',
                          bgcolor: `${cat.color}0d`,
                          borderRadius: '20px',
                          alignSelf: 'flex-start',
                        }}>
                          <Typography sx={{
                            fontSize: 11, fontWeight: 600, color: cat.color,
                            fontFamily: FONT, letterSpacing: '0.01em',
                          }}>
                            {cat.questions.length} suggested questions
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* ── Step 2: Questions ─────────────────────── */}
                {selectedCategory !== null && activeCat && (
                  <Box sx={{ pb: 3 }}>
                    {/* Back + category header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '20px' }}>
                      <Box
                        component="button"
                        onClick={() => setSelectedCategory(null)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          cursor: 'pointer', border: 'none', bgcolor: 'transparent',
                          p: '5px 8px', borderRadius: '7px',
                          transition: 'all 0.14s',
                          '&:hover': { bgcolor: '#f0f2f6' },
                        }}
                      >
                        <BackIcon sx={{ fontSize: 16, color: '#8492a6' }} />
                        <Typography sx={{ fontSize: 12.5, color: '#8492a6', fontFamily: FONT, fontWeight: 500 }}>
                          Back
                        </Typography>
                      </Box>

                      <Box sx={{ width: '1px', height: 16, bgcolor: '#e0e4ea' }} />

                      <Box sx={{
                        width: 26, height: 26, borderRadius: '7px', bgcolor: activeCat.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <activeCat.Icon sx={{ fontSize: 14, color: activeCat.color }} />
                      </Box>
                      <Typography sx={{
                        fontSize: 13, fontWeight: 700, color: activeCat.color,
                        fontFamily: FONT, letterSpacing: '-0.01em',
                      }}>
                        {activeCat.label}
                      </Typography>
                    </Box>

                    {/* Question list */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activeCat.questions.map((q, qi) => (
                        <Box
                          key={qi}
                          component="button"
                          onClick={() => handleQuestionClick(q, activeCat.isAnalysis)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            px: '18px', py: '14px',
                            bgcolor: 'white',
                            border: '1.5px solid #e8edf4',
                            borderRadius: '11px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              bgcolor: activeCat.bg,
                              borderColor: `${activeCat.color}44`,
                              boxShadow: `0 3px 14px ${activeCat.color}18`,
                              transform: 'translateY(-1px)',
                              '& .q-arrow': { opacity: 1, transform: 'translateX(3px)' },
                            },
                            '&:active': { transform: 'translateY(0)' },
                          }}
                        >
                          <Box sx={{
                            width: 20, height: 20, borderRadius: '6px',
                            bgcolor: `${activeCat.color}18`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <SparkleIcon sx={{ fontSize: 11, color: activeCat.color }} />
                          </Box>
                          <Typography sx={{
                            flex: 1, fontSize: 13.5, color: '#2a3142',
                            fontFamily: FONT, lineHeight: 1.5, fontWeight: 400,
                          }}>
                            {q}
                          </Typography>
                          <ArrowIcon
                            className="q-arrow"
                            sx={{ fontSize: 17, color: '#c8d0dc', flexShrink: 0, opacity: 0, transition: 'all 0.15s ease' }}
                          />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

              </Box>

              {/* Input */}
              <Box sx={{
                px: { xs: 2.5, sm: '48px' }, pb: 2.5, pt: 1.5,
                flexShrink: 0, borderTop: '1px solid #f0f2f5', bgcolor: 'white',
              }}>
                <InputBox
                  inputRef={inputRef}
                  value={inputText}
                  onChange={setInputText}
                  onKeyDown={handleKeyDown}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                  height={54}
                  placeholder={
                    activeCat
                      ? `Ask a ${activeCat.label.toLowerCase()} question…`
                      : 'Ask a question about your energy data…'
                  }
                />
                <Typography sx={{ fontSize: 11, color: '#333', opacity: 0.2, textAlign: 'center', mt: 1.25, fontFamily: FONT }}>
                  AI may occasionally make mistakes. Verify important numbers independently.
                </Typography>
              </Box>
            </Box>

          ) : (

            // ── Chat ──────────────────────────────────────────
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5, bgcolor: '#F1F5F9' }}>
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

                {/* Follow-up chips from agent's starter questions */}
                {lastMessageComplete && agentStarterQuestions.length > 0 && (
                  <Box sx={{ mt: 3, mb: 1 }}>
                    <Typography sx={{
                      fontSize: 10.5, fontWeight: 700, color: '#b0b8c8',
                      fontFamily: FONT, mb: 1.5, pl: '2px',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                      Try asking
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {agentStarterQuestions.slice(0, 4).map((q, i) => (
                        <Box
                          key={i}
                          component="button"
                          onClick={() => handleQuestionClick(q, isAnalysis)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            px: '12px', py: '7px',
                            bgcolor: 'white',
                            border: `1.5px solid ${BLUE}28`,
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontFamily: FONT, fontSize: 12.5, color: '#2a2e3a',
                            transition: 'all 0.15s',
                            '&:hover': { bgcolor: `${BLUE}08`, borderColor: `${BLUE}60`, color: BLUE },
                          }}
                        >
                          <SparkleIcon sx={{ fontSize: 11, color: BLUE, flexShrink: 0 }} />
                          {q}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                <div ref={messagesEndRef} />
              </Box>

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

      {/* FAB */}
      <Zoom in={!open}>
        <Fab
          onClick={() => setOpen(true)}
          aria-label="Open Energy Assistant"
          sx={{
            position: 'fixed', bottom: 32, right: 32,
            background: GRADIENT, color: 'white', zIndex: 1200,
            width: 56, height: 56,
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

// ── Input box ──────────────────────────────────────────────────

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
      width: '100%', height,
      border: `1.5px solid ${isLoading ? RED + '50' : '#d8dbe2'}`,
      borderRadius: '10px',
      boxShadow: isLoading ? `0 0 0 3px ${RED}14` : '0px 1px 6px rgba(40,41,61,0.05)',
      bgcolor: 'white', position: 'relative', overflow: 'hidden',
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
        position: 'absolute', inset: 0,
        '& .MuiInputBase-root': {
          height: '100%', alignItems: 'flex-start',
          px: '14px', pt: height >= 60 ? '12px' : '0px',
          fontFamily: FONT, fontSize: 14, color: '#1a1d23',
        },
        '& .MuiInputBase-input::placeholder': { color: '#b0b8c8', opacity: 1 },
        '& .MuiInput-underline:before': { display: 'none' },
        '& .MuiInput-underline:after':  { display: 'none' },
        '& textarea': { resize: 'none' },
      }}
    />
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
        width: 34, height: 34,
        bgcolor: isLoading ? '#fff2f2' : !value.trim() ? '#f4f6f9' : BLUE,
        borderRadius: '8px', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
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
        ? <StopIcon  sx={{ fontSize: 15, color: RED }} />
        : <SendIcon  sx={{ fontSize: 15, color: value.trim() ? 'white' : '#c8cdd8', transform: 'rotate(-45deg)', transition: 'color 0.15s' }} />
      }
    </Box>
  </Box>
);
