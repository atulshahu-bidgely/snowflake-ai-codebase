/**
 * UsagePopover
 * Ported from AWB_and_Grid_Twin (src/components/UsagePopover.tsx) and rewired to
 * this app's credits model. Displays:
 *   • credits remaining for the current user (live, from user_tracker.csv)
 *   • the credit cost of each question type, sourced from the backend .env
 *     (LEFT_COST / MIDDLE_COST / RIGHT_COST)
 */
import React from 'react';
import { Popover, Box, Typography } from '@mui/material';
import { UsageData } from '../hooks/useUsage';

const FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const GRADIENT = 'linear-gradient(135deg, #0f4184 0%, #1e62c1 28%, #94207b 55%, #e4194b 80%, #f1774a 100%)';

interface UsagePopoverProps {
  usage: UsageData | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const pluralCredits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`;

export const UsagePopover: React.FC<UsagePopoverProps> = ({ usage, anchorEl, onClose }) => {
  if (!usage) return null;

  const { creditsLeft, creditAllowance, resetInterval, costs } = usage;
  const usedPct = creditAllowance > 0
    ? Math.min(((creditAllowance - creditsLeft) / creditAllowance) * 100, 100)
    : 0;
  const barColor = creditsLeft <= 10 ? '#ef4444' : creditsLeft <= 20 ? '#f59e0b' : '#94a3b8';

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{
        '& .MuiPopover-paper': {
          width: 340,
          borderRadius: '16px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.14), 0 2px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          mt: 1,
        },
      }}
    >
      {/* Gradient header band */}
      <Box sx={{ height: 3, background: GRADIENT }} />

      <Box sx={{ p: 3 }}>

        {/* Label row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1a1d23', fontFamily: FONT, letterSpacing: '-0.02em' }}>
            Credits
          </Typography>
          <Box sx={{ bgcolor: '#f0f2f5', borderRadius: '20px', px: '12px', py: '3px' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#6b7280', fontFamily: FONT, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Resets {resetInterval}
            </Typography>
          </Box>
        </Box>

        {/* Credits remaining numbers */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '3px', mb: '10px' }}>
          <Typography sx={{
            fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em',
            color: barColor, fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
          }}>
            {creditsLeft}
          </Typography>
          <Typography sx={{
            fontSize: 22, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em',
            color: '#d1d5db', fontFamily: FONT, mx: '2px',
          }}>
            /
          </Typography>
          <Typography sx={{
            fontSize: 22, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em',
            color: '#9ca3af', fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
          }}>
            {creditAllowance}
          </Typography>
        </Box>

        {/* Progress bar (proportion of allowance consumed) */}
        <Box sx={{ height: 6, borderRadius: 3, bgcolor: '#e8edf4', overflow: 'hidden', mb: 1 }}>
          <Box sx={{
            height: '100%', width: `${usedPct}%`, borderRadius: 3,
            bgcolor: barColor, transition: 'width 0.5s ease',
          }} />
        </Box>

        {/* Below bar row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography sx={{ fontSize: 12, color: '#9ca3af', fontFamily: FONT }}>
            {creditsLeft > 0 ? `${pluralCredits(creditsLeft)} remaining` : 'No credits remaining'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#9ca3af', fontFamily: FONT }}>
            Resets every {resetInterval}
          </Typography>
        </Box>

        {/* Divider */}
        <Box sx={{ height: '1px', bgcolor: '#f0f2f5', mb: 3 }} />

        {/* Credit cost breakdown — values sourced from backend .env */}
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1a1d23', fontFamily: FONT, mb: '10px' }}>
            Credit cost per question type
          </Typography>
          {[
            { label: 'Data query',     cost: costs.dataQuery,     color: '#2563EB', bg: '#EFF6FF' },
            { label: 'Trend analysis', cost: costs.trendAnalysis, color: '#7C3AED', bg: '#F5F3FF' },
            { label: 'Targeting',      cost: costs.targeting,     color: '#059669', bg: '#ECFDF5' },
          ].map(item => (
            <Box key={item.label} sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              py: '7px', borderBottom: '1px solid #f0f2f5',
              '&:last-child': { borderBottom: 'none' },
            }}>
              <Typography sx={{ fontSize: 12, color: '#374151', fontFamily: FONT }}>
                {item.label}
              </Typography>
              <Box sx={{ bgcolor: item.bg, borderRadius: '20px', px: '10px', py: '2px' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: item.color, fontFamily: FONT }}>
                  {pluralCredits(item.cost)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

      </Box>
    </Popover>
  );
};
