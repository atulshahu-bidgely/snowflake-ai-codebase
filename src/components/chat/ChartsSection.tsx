import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, BarChart as BarChartIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';
import { ChartVisualization } from '../ChartVisualization';
import { ChartContent } from '../../types/chart';

// explicit tokens — no theme inheritance
const BLUE    = '#2563EB';
const BLUE_BG = '#EFF6FF';
const BLUE_BD = '#BFDBFE';
const BORDER  = '#E2E8F0';

interface ChartsSectionProps {
  messageId: string;
  charts: ChartContent[];
  collapsed: boolean;
  onToggle: (messageId: string) => void;
}

export const ChartsSection: React.FC<ChartsSectionProps> = ({
  messageId,
  charts,
  collapsed,
  onToggle,
}) => {
  if (!charts || charts.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 2,
        mb: 2,
        borderRadius: '10px',
        border: `1px solid ${BLUE_BD}`,
        bgcolor: BLUE_BG,
        overflow: 'visible',
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
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 15, color: BLUE }} />}
          sx={{
            minHeight: '40px',
            px: 2, py: 0,
            background: 'transparent',
            '& .MuiAccordionSummary-content': { margin: '10px 0', alignItems: 'center', gap: '8px' },
            '&.Mui-expanded': { minHeight: '40px' },
          }}
        >
          <Box sx={{
            width: 26, height: 26, borderRadius: '7px', bgcolor: `${BLUE}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <BarChartIcon sx={{ fontSize: 14, color: BLUE }} />
          </Box>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: BLUE, letterSpacing: '0.02em', userSelect: 'none' }}>
            {CHAT_TEXT.VISUALIZATION.TITLE}
          </Typography>
          <Box sx={{
            px: '7px', py: '2px', borderRadius: '20px',
            bgcolor: `${BLUE}14`, border: `1px solid ${BLUE_BD}`,
          }}>
            <Typography sx={{ fontSize: '0.7rem', color: BLUE, fontWeight: 500 }}>
              {charts.length} {charts.length !== 1 ? 'charts' : 'chart'}
            </Typography>
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ px: 2, pt: 0, pb: 2, background: 'transparent' }}>
          <Box sx={{ height: 1, bgcolor: BLUE_BD, mb: 2 }} />
          <Stack spacing={3}>
            {charts.map((chartContent, index) => (
              <Box
                key={index}
                sx={{
                  bgcolor: '#ffffff',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  p: 2,
                  overflow: 'visible',
                }}
              >
                <ChartVisualization chartContent={chartContent} height={300} />
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
