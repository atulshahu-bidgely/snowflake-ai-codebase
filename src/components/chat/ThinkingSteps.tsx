import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';
import { extractThinkingPreview } from '../../utils/chatUtils';

// explicit tokens — no theme inheritance
const BG     = '#EFF6FF';  // Blue-50
const BORDER = '#BFDBFE';  // Blue-200
const TITLE  = '#1D4ED8';  // Blue-700  (contrast 5.9:1 on #EFF6FF)
const RULE   = '#93C5FD';  // Blue-300
const TEXT   = '#374151';  // Gray-700  (contrast 9.7:1 on #EFF6FF)
const STATUS = '#4B5563';  // Gray-600

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
  const previewParagraphs = useMemo(() => extractThinkingPreview(thinkingTexts), [thinkingTexts]);

  if (!isStreaming && !thinkingTexts.length && !thinkingSteps.length) {
    return null;
  }

  return (
    <Box
      sx={{
        mb: 2,
        borderRadius: '10px',
        border: `1px solid ${BORDER}`,
        bgcolor: BG,
        overflow: 'hidden',
      }}
    >
      <Accordion
        expanded={!collapsed}
        onChange={() => onToggle(messageId)}
        disableGutters
        sx={{
          boxShadow: 'none',
          background: 'transparent',
          '&:before': { display: 'none' },
        }}
      >
        {/* Header */}
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 15, color: TITLE }} />}
          sx={{
            minHeight: '38px',
            px: 2,
            py: 0,
            background: 'transparent',
            '& .MuiAccordionSummary-content': { margin: '10px 0', alignItems: 'center', gap: '8px' },
            '&.Mui-expanded': { minHeight: '38px' },
          }}
        >
          {isStreaming ? (
            <CircularProgress size={11} thickness={4} sx={{ color: TITLE, flexShrink: 0 }} />
          ) : (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: RULE, flexShrink: 0 }} />
          )}
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: TITLE,
              letterSpacing: '0.02em',
              userSelect: 'none',
            }}
          >
            {isStreaming ? 'Thinking…' : CHAT_TEXT.THINKING_STEPS.TITLE}
          </Typography>
        </AccordionSummary>

        {/* Content */}
        <AccordionDetails sx={{ px: 2, pt: 0, pb: 1.5, background: 'transparent' }}>
          {previewParagraphs.length > 0 && (
            <Box sx={{ borderLeft: `2px solid ${RULE}`, pl: 1.5 }}>
              {previewParagraphs.map((para: string, i: number) => (
                <Typography
                  key={i}
                  sx={{
                    fontSize: '0.8125rem',
                    lineHeight: 1.65,
                    color: TEXT,
                    fontStyle: 'italic',
                    mb: 0.75,
                    '&:last-child': { mb: 0 },
                    wordBreak: 'break-word',
                  }}
                >
                  {para}
                </Typography>
              ))}
            </Box>
          )}

          {isStreaming && streamingStatus && (
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: STATUS,
                fontStyle: 'italic',
                mt: thinkingTexts.some(t => t.trim()) ? 1 : 0,
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
