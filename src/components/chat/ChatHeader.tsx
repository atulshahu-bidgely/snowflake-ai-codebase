/**
 * ChatHeader Component
 * Displays the application header with logo, title, and theme toggle
 */

import React, { useState } from 'react';
import { Box, Container, Paper, Typography, Link, ButtonBase } from '@mui/material';
import { HEADER_TEXT } from '../../constants/textConstants';
import { ThemeToggle } from '../ThemeToggle';
import { useUsage } from '../../hooks/useUsage';
import { UsagePopover } from '../UsagePopover';

const HEADER_FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const ChatHeader: React.FC = () => {
  const { usage } = useUsage();
  const [usageAnchorEl, setUsageAnchorEl] = useState<HTMLElement | null>(null);

  const creditPct = usage && usage.creditAllowance > 0
    ? (usage.creditsLeft / usage.creditAllowance) * 100
    : 100;
  const creditColor = creditPct <= 10 ? '#ef4444' : creditPct <= 25 ? '#f59e0b' : '#0c6ae9';

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderRadius: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <Container maxWidth="lg">
          <Box sx={{ py: 1.25, position: 'relative' }}>
            {/* Title */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 7 }}>
              <Box
                component="img"
                src={HEADER_TEXT.LOGO_PATH}
                alt={HEADER_TEXT.LOGO_ALT}
                sx={{
                  height: 48,
                  width: 'auto',
                  objectFit: 'contain',
                  imageRendering: 'crisp-edges',
                  filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.1))',
                  '@media (max-width: 600px)': {
                    height: 40
                  }
                }}
                onError={(e) => {
                  // Hide icon if image fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Typography
                  variant="h2"
                  component="h1"
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    fontSize: { xs: '1.4rem', sm: '1.75rem' }
                  }}
                >
                  {HEADER_TEXT.MAIN_TITLE}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                    fontWeight: 400,
                    opacity: 0.8,
                    lineHeight: 1.4,
                  }}
                >
                  {HEADER_TEXT.SUBTITLE_PREFIX}{' '}
                  <Link 
                    href={HEADER_TEXT.CORTEX_AGENTS_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ 
                      color: 'primary.main',
                      textDecoration: 'none',
                      fontWeight: 500,
                      '&:hover': {
                        textDecoration: 'underline',
                        color: 'primary.light'
                      }
                    }}
                  >
                    {HEADER_TEXT.SUBTITLE_MIDDLE}
                  </Link>
                  {' | '}{HEADER_TEXT.SUBTITLE_SUFFIX}{' '}
                  <Link 
                    href={HEADER_TEXT.SUBTITLE_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ 
                      color: 'primary.main',
                      textDecoration: 'none',
                      fontWeight: 500,
                      '&:hover': {
                        textDecoration: 'underline',
                        color: 'primary.light'
                      }
                    }}
                  >
                    {HEADER_TEXT.SUBTITLE_DEVELOPER}
                  </Link>
                </Typography>
              </Box>
            </Box>
            
            {/* Theme Toggle - Aligned with container edge */}
            <Box sx={{ 
              position: 'absolute', 
              top: 16, 
              right: 16,
              display: 'flex', 
              alignItems: 'center', 
              gap: 1,
              '@media (max-width: 600px)': {
                right: 16
              }
            }}>
              {usage && (
                <ButtonBase
                  onClick={(e) => setUsageAnchorEl(e.currentTarget)}
                  aria-label="View credits and credit costs"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    '&:hover': { borderColor: creditColor, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: creditColor }} />
                  <Typography sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'text.primary',
                    fontFamily: HEADER_FONT,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {usage.creditsLeft.toLocaleString('en-US')}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: HEADER_FONT }}>
                    credits
                  </Typography>
                </ButtonBase>
              )}
              <ThemeToggle />
            </Box>

            <UsagePopover
              usage={usage}
              anchorEl={usageAnchorEl}
              onClose={() => setUsageAnchorEl(null)}
            />
          </Box>
        </Container>
      </Box>
    </Paper>
  );
};


