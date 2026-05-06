import React from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';
import { splitThinkingTextIntoParagraphs } from '../../utils/chatUtils';

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

        {/* ── Content ── */}
        <AccordionDetails sx={{ px: 2, pt: 0, pb: 1.5 }}>
          {thinkingTexts.length > 0 &&
            thinkingTexts.some(t => t.trim().length > 0) && (
              <Box sx={{ borderLeft: `2px solid ${isDark ? alpha('#fff', 0.08) : alpha('#000', 0.08)}`, pl: 1.5 }}>
                {thinkingTexts
                  .filter(t => t.trim().length > 0)
                  .flatMap((text, ti) =>
                    splitThinkingTextIntoParagraphs(text).map((para, pi) => (
                      <Typography
                        key={`${ti}-${pi}`}
                        sx={{
                          fontSize: '0.8rem',
                          lineHeight: 1.65,
                          color: isDark ? alpha('#fff', 0.35) : alpha('#000', 0.38),
                          fontStyle: 'italic',
                          mb: 0.75,
                          '&:last-child': { mb: 0 },
                          wordBreak: 'break-word',
                        }}
                      >
                        {para}
                      </Typography>
                    ))
                  )}
              </Box>
            )}

          {/* Live streaming step label */}
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
