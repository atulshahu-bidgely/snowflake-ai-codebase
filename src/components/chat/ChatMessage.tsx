import React, { useState } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Fade,
  Stack,
  keyframes,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';
import { ChatMessage as ChatMessageType } from '../../types/chat';
import { ThinkingSteps } from './ThinkingSteps';
import { ChartsSection } from './ChartsSection';
import { AnnotationsSection } from './AnnotationsSection';
import { MarkdownFormatter } from './MarkdownFormatter';
import { MESSAGE_LABELS } from '../../constants/textConstants';

// explicit tokens — no MUI theme inheritance
const BLUE     = '#2563EB';
const BLUE_BG  = '#EFF6FF';
const BLUE_SHD = 'rgba(37,99,235,0.28)';
const TEXT     = '#1E293B';
const TEXT2    = '#64748B';
const BORDER   = '#E2E8F0';
const AMBER_BG = '#FFFBEB';
const AMBER_BD = '#FCD34D';
const AMBER_LB = '#F59E0B';
const AMBER_H  = '#92400E';
const AMBER_B  = '#78350F';

const dotBounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%            { transform: translateY(-5px); opacity: 1; }
`;

interface ChatMessageProps {
  message: ChatMessageType;
  collapsedThinking: boolean;
  collapsedCharts: boolean;
  collapsedAnnotations: boolean;
  onToggleThinking: (messageId: string) => void;
  onToggleCharts: (messageId: string) => void;
  onToggleAnnotations: (messageId: string) => void;
  onResendMessage?: (text: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  collapsedThinking,
  collapsedCharts,
  collapsedAnnotations,
  onToggleThinking,
  onToggleCharts,
  onToggleAnnotations,
  onResendMessage,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleResend = () => {
    if (onResendMessage && message.text) onResendMessage(message.text);
  };

  const isUser      = message.sender === 'user';
  const isAssistant = message.sender === 'assistant';

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: { xs: isUser ? '85%' : '100%', sm: isUser ? '72%' : '98%' },
          width: isUser ? 'auto' : { xs: '100%', sm: '98%' },
        }}
      >
        {/* ── Bubble ─────────────────────────────────────────── */}
        <Box
          sx={{
            bgcolor: isUser ? BLUE : '#FFFFFF',
            borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
            border: isUser ? 'none' : `1px solid ${BORDER}`,
            boxShadow: isUser
              ? `0 2px 10px ${BLUE_SHD}`
              : '0 1px 4px rgba(0,0,0,0.05)',
            transition: 'box-shadow 0.2s ease',
            '&:hover': {
              boxShadow: isUser
                ? '0 4px 16px rgba(37,99,235,0.36)'
                : '0 2px 10px rgba(0,0,0,0.09)',
            },
          }}
        >
          <Box sx={{ py: isUser ? 1.5 : 2.25, px: { xs: 2, sm: isUser ? 2 : 2.5 } }}>

            {/* Typing dots — before any content arrives */}
            {isAssistant &&
             message.isStreaming &&
             !message.text?.trim() &&
             !message.thinkingTexts?.some(t => t.trim()) &&
             !message.streamingStatus && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', py: 0.5 }}>
                {[0, 1, 2].map(i => (
                  <Box
                    key={i}
                    sx={{
                      width: 7, height: 7, borderRadius: '50%',
                      bgcolor: '#94A3B8',
                      animation: `${dotBounce} 1.2s ease-in-out infinite`,
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Thinking steps */}
            {isAssistant && (
              <ThinkingSteps
                messageId={message.id}
                thinkingTexts={message.thinkingTexts}
                thinkingSteps={message.thinkingSteps}
                isStreaming={message.isStreaming}
                streamingStatus={message.streamingStatus}
                collapsed={collapsedThinking}
                onToggle={onToggleThinking}
              />
            )}

            {/* Charts */}
            {isAssistant &&
             message.charts &&
             message.charts.length > 0 &&
             message.status === 'sent' &&
             !message.isStreaming && (
              <ChartsSection
                messageId={message.id}
                charts={message.charts}
                collapsed={collapsedCharts}
                onToggle={onToggleCharts}
              />
            )}

            {/* Slim progress bar — streaming with content visible */}
            {message.status === 'thinking' &&
             isAssistant &&
             (message.text?.trim() || message.thinkingTexts?.some(t => t.trim()) || message.streamingStatus) && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress
                  sx={{
                    height: 2,
                    borderRadius: 1,
                    bgcolor: '#DBEAFE',
                    '& .MuiLinearProgress-bar': { bgcolor: BLUE },
                  }}
                />
              </Box>
            )}

            {/* Message text */}
            {isUser ? (
              message.text?.trim() && (
                <Typography
                  sx={{
                    color: '#FFFFFF',
                    fontWeight: 500,
                    fontSize: '0.9375rem',
                    lineHeight: 1.65,
                  }}
                >
                  {message.text}
                </Typography>
              )
            ) : (
              message.text?.trim() && (
                <Box>
                  <MarkdownFormatter content={message.text} />
                  {message.status === 'sent' &&
                   !message.isStreaming &&
                   message.annotations &&
                   message.annotations.length > 0 && (
                    <AnnotationsSection
                      messageId={message.id}
                      annotations={message.annotations}
                      collapsed={collapsedAnnotations}
                      onToggle={onToggleAnnotations}
                    />
                  )}
                </Box>
              )
            )}

            {/* Error */}
            {message.status === 'error' && message.error?.trim() && (
              <Box
                sx={{
                  mt: 1.5, py: 1.5, px: 2,
                  bgcolor: AMBER_BG,
                  border: `1px solid ${AMBER_BD}`,
                  borderLeft: `4px solid ${AMBER_LB}`,
                  borderRadius: 1.5,
                }}
              >
                {(() => {
                  const parts = message.error.split('\n\n');
                  const header = parts[0];
                  const rest   = parts.slice(1).join('\n\n');
                  return (
                    <>
                      <Typography
                        sx={{
                          fontSize: { xs: '1rem', sm: '1.15rem' },
                          fontWeight: 700,
                          color: AMBER_H,
                          textAlign: 'center',
                          mb: rest ? 1.5 : 0,
                        }}
                      >
                        {header}
                      </Typography>
                      {rest && (
                        <Typography
                          sx={{
                            fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                            color: AMBER_B,
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.6,
                          }}
                        >
                          {rest}
                        </Typography>
                      )}
                    </>
                  );
                })()}
              </Box>
            )}

          </Box>
        </Box>

        {/* ── User action row ─────────────────────────────────── */}
        {isUser && message.text?.trim() && (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              mt: 0.5,
              justifyContent: 'flex-end',
              opacity: 0.55,
              '&:hover': { opacity: 1 },
              transition: 'opacity 0.2s',
            }}
          >
            <Tooltip title={copySuccess ? MESSAGE_LABELS.COPY_SUCCESS : MESSAGE_LABELS.COPY_USER_MESSAGE_TOOLTIP} arrow>
              <IconButton
                onClick={handleCopy}
                size="small"
                sx={{ color: TEXT2, p: '4px', borderRadius: '6px', '&:hover': { color: BLUE, bgcolor: BLUE_BG } }}
              >
                <CopyIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
            {onResendMessage && (
              <Tooltip title={MESSAGE_LABELS.RESEND_MESSAGE_TOOLTIP} arrow>
                <IconButton
                  onClick={handleResend}
                  size="small"
                  sx={{ color: TEXT2, p: '4px', borderRadius: '6px', '&:hover': { color: BLUE, bgcolor: BLUE_BG } }}
                >
                  <ReplayIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}

        {/* ── Assistant action row ────────────────────────────── */}
        {isAssistant &&
         message.status === 'sent' &&
         !message.isStreaming &&
         message.text?.trim() && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              mt: 0.5,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: 0.55,
              '&:hover': { opacity: 1 },
              transition: 'opacity 0.2s',
            }}
          >
            <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.75rem', color: TEXT2 }}>
              {MESSAGE_LABELS.DISCLAIMER}
            </Typography>
            <Tooltip title={copySuccess ? MESSAGE_LABELS.COPY_SUCCESS : MESSAGE_LABELS.COPY_ASSISTANT_MESSAGE_TOOLTIP} arrow>
              <IconButton
                onClick={handleCopy}
                size="small"
                sx={{ color: TEXT2, p: '4px', borderRadius: '6px', '&:hover': { color: BLUE, bgcolor: BLUE_BG } }}
              >
                <CopyIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Box>
    </Fade>
  );
};
