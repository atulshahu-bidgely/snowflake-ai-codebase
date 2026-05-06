import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme
} from '@mui/material';
import { KeyboardArrowUp as ArrowUpIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';

interface StarterQuestionsProps {
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  agentName: string;
  questions: string[];
  onQuestionClick: (question: string) => void;
}

export const StarterQuestions: React.FC<StarterQuestionsProps> = ({
  expanded,
  onToggle,
  agentName,
  questions,
  onQuestionClick
}) => {
  const theme = useTheme();

  return (
    <Box>
      <Accordion
        expanded={expanded}
        onChange={(event, isExpanded) => onToggle(isExpanded)}
        sx={{
          maxWidth: '98%',
          width: '100%',
          margin: '0 !important',
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? alpha(theme.palette.grey[900], 0.8)
            : 'background.paper',
          border: (theme) => theme.palette.mode === 'dark'
            ? `1px solid ${alpha(theme.palette.grey[700], 0.3)}`
            : `1px solid ${alpha(theme.palette.grey[300], 0.5)}`,
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: '0 !important' },
        }}
      >
        <AccordionSummary
          expandIcon={
            <ArrowUpIcon
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          }
          sx={{
            '& .MuiAccordionSummary-content': {
              margin: '12px 0',
              '&.Mui-expanded': { margin: '12px 0' },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, fontSize: '1rem' }}>
              {CHAT_TEXT.STARTER_QUESTIONS.TITLE}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: '1rem', textDecoration: 'underline' }}>
              {agentName}
            </Typography>
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.875rem', mb: 1.5, display: 'block' }}>
            {CHAT_TEXT.STARTER_QUESTIONS.SUBTITLE}
          </Typography>
          <Stack spacing={0.5}>
            {questions.map((question, index) => (
              <Paper
                key={index}
                elevation={0}
                sx={{
                  px: 1.5,
                  py: 1,
                  cursor: 'pointer',
                  borderRadius: 1.5,
                  background: (theme) => theme.palette.mode === 'dark'
                    ? alpha(theme.palette.grey[800], 0.3)
                    : alpha(theme.palette.grey[50], 0.8),
                  border: (theme) => theme.palette.mode === 'dark'
                    ? `1px solid ${alpha(theme.palette.grey[700], 0.2)}`
                    : `1px solid ${alpha(theme.palette.grey[200], 0.8)}`,
                  borderLeft: `3px solid transparent`,
                  transition: 'all 0.18s ease',
                  '&:hover': {
                    background: (theme) => theme.palette.mode === 'dark'
                      ? alpha(theme.palette.primary.main, 0.08)
                      : alpha(theme.palette.primary.main, 0.04),
                    borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
                    borderLeft: (theme) => `3px solid ${theme.palette.primary.main}`,
                    '& .question-text': { color: 'text.primary' },
                    '& .arrow-icon': { opacity: 1, transform: 'rotate(45deg) translateX(2px)' },
                  },
                }}
                onClick={() => onQuestionClick(question)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      minWidth: 16,
                      lineHeight: 1,
                    }}
                  >
                    {index + 1}.
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      className="question-text"
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontWeight: 400,
                        lineHeight: 1.45,
                        fontSize: '0.9rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        transition: 'color 0.18s ease',
                      }}
                    >
                      {question}
                    </Typography>
                  </Box>
                  <ArrowUpIcon
                    className="arrow-icon"
                    sx={{
                      fontSize: '0.9rem',
                      color: 'primary.main',
                      transform: 'rotate(45deg)',
                      opacity: 0.35,
                      flexShrink: 0,
                      transition: 'all 0.18s ease',
                    }}
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
