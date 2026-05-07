import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';
import { extractThinkingPreview } from '../../utils/chatUtils';

interface ThinkingStepsProps {
  messageId: string;
  thinkingTexts?: string[];
  thinkingSteps?: string[];
  isStreaming?: boolean;
  streamingStatus?: string;
  collapsed: boolean;
  onToggle: (messageId: string) => void;
}

export const ThinkingSteps: React.FC<ThinkingStepsProps> = ({
  messageId,
  thinkingTexts = [],
  thinkingSteps = [],
  isStreaming = false,
  streamingStatus,
  collapsed,
  onToggle,
}) => {
  const theme = useTheme();
  const previewParagraphs = useMemo(() => extractThinkingPreview(thinkingTexts), [thinkingTexts]);

  if (!thinkingTexts.length && !thinkingSteps.length) {
    return null;
  }

  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        mb: 1.5,
        borderRadius: 1,
        border: `1px solid ${isDark ? alpha('#fff', 0.06) : alpha('#000', 0.07)}`,
        bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.015),
        overflow: 'hidden',
      }}
    >
      <Accordion
        expanded={!collapsed}
        onChange={() => onToggle(messageId)}
        sx={{
          boxShadow: 'none',
          backgroundColor: 'transparent',
          '&:before': { display: 'none' },
        }}
      >
        {/* ── Header ── */}
        <AccordionSummary
          expandIcon={
            <ExpandMoreIcon
              sx={{ fontSize: 16, color: 'text.disabled', opacity: 0.6 }}
            />
          }
          sx={{
            minHeight: 'unset',
            px: 2,
            py: 0.75,
            '& .MuiAccordionSummary-content': { margin: 0, alignItems: 'center', gap: 1 },
            '&.Mui-expanded': { minHeight: 'unset' },
            '& .MuiAccordionSummary-content.Mui-expanded': { margin: 0 },
          }}
        >
          {/* Live spinner when streaming, static dot when done */}
          {isStreaming ? (
            <CircularProgress
              size={11}
              thickness={4}
              sx={{ color: 'text.disabled', opacity: 0.5, flexShrink: 0 }}
            />
          ) : (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: isDark ? alpha('#fff', 0.2) : alpha('#000', 0.18),
                flexShrink: 0,
              }}
            />
          )}
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'text.disabled',
              letterSpacing: '0.01em',
              userSelect: 'none',
            }}
          >
            {isStreaming ? 'Thinking…' : CHAT_TEXT.THINKING_STEPS.TITLE}
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 1 }}>
          <Divider sx={{ mb: 2, bgcolor: alpha(theme.palette.primary.main, 0.3) }} />
          
          {/* Top 2 meaningful paragraphs — table names, schema, reasoning extracted in background */}
          {previewParagraphs.map((para: string, i: number) => (
            <Box
              key={i}
              sx={{
                p: 2,
                mb: i < previewParagraphs.length - 1 ? 1 : 0,
                borderRadius: 1.5,
                bgcolor: isDark
                  ? alpha(theme.palette.grey[800], 0.6)
                  : alpha(theme.palette.grey[50], 0.8),
                borderLeft: `4px solid ${alpha(theme.palette.secondary.main, 0.5)}`,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  fontStyle: 'italic',
                  fontSize: { xs: '0.8rem', sm: '0.9rem' },
                  lineHeight: 1.6,
                }}
              >
                {para}
              </Typography>
            </Box>
          ))}
          
          {/* Streaming Status within Thinking Steps */}
          {isStreaming && streamingStatus && (
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: 'text.disabled',
                fontStyle: 'italic',
                mt: thinkingTexts.some(t => t.trim()) ? 1 : 0,
                opacity: 0.7,
              }}
            >
              {streamingStatus}
            </Typography>
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
