/**
 * ChatHeader Component
 * Displays the application header with logo, title, and theme toggle
 */

import React from 'react';
import { Box, Container, Paper, Typography, Link } from '@mui/material';
import { HEADER_TEXT } from '../../constants/textConstants';
import { ThemeToggle } from '../ThemeToggle';

export const ChatHeader: React.FC = () => {
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
              <ThemeToggle />
            </Box>
          </Box>
        </Container>
      </Box>
    </Paper>
  );
};


