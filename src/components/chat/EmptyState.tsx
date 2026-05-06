/**
 * EmptyState Component
 * Displays greeting card when there are no messages
 */

import React, { useState } from 'react';
import { Card, CardContent, Typography, Box, alpha, keyframes } from '@mui/material';
import { Brush as BrushIcon } from '@mui/icons-material';
import { CHAT_TEXT } from '../../constants/textConstants';
import { getTimeBasedGreeting, formatDate, formatTime } from '../../utils/chatUtils';

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const gradientShift = keyframes`
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
`;

const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

export const EmptyState: React.FC = () => {
  const currentDate = new Date();
  
  // Calculate greeting only once on mount using lazy initialization
  const [greeting] = useState(() => getTimeBasedGreeting());
  
  return (
    <Card
      sx={{
        maxWidth: '98%',
        width: '100%',
        bgcolor: 'transparent',
        border: 'none',
        boxShadow: 'none',
        animation: `${fadeInUp} 0.6s ease-out`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <CardContent sx={{ textAlign: 'center', py: 2, bgcolor: 'transparent' }}>
        {/* Greeting with animated gradient */}
        <Typography
          variant="h1"
          sx={{
            mb: 1,
            fontWeight: 700,
            fontSize: { xs: '2.25rem', sm: '2.75rem' },
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #667eea 75%, #764ba2 100%)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #4facfe 50%, #667eea 75%, #764ba2 100%)',
            backgroundSize: '200% 200%',
            animation: `${gradientShift} 8s ease infinite`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
            letterSpacing: '-0.02em',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {greeting}
        </Typography>

        {/* Date / time */}
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 3, fontWeight: 400, fontSize: { xs: '0.9rem', sm: '0.95rem' }, opacity: 0.65 }}
        >
          {formatDate(currentDate)} • {formatTime(currentDate)}
        </Typography>

        {/* Subheader badge */}
        <Box
          sx={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2.5,
            py: 1.25,
            borderRadius: 2,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${alpha(theme.palette.secondary.main, 0.04)} 100%)`,
            border: (theme) => `1.5px solid ${alpha(theme.palette.primary.main, 0.25)}`,
            boxShadow: (theme) => `0 2px 12px ${alpha(theme.palette.primary.main, 0.08)}`,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            '&:hover': {
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.45),
              boxShadow: (theme) => `0 6px 20px ${alpha(theme.palette.primary.main, 0.18)}`,
              '& .badge-shimmer': { opacity: 1 },
            },
          }}
        >
          {/* Shimmer overlay on hover only */}
          <Box
            className="badge-shimmer"
            sx={{
              position: 'absolute',
              inset: 0,
              background: (theme) =>
                `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.1)}, transparent)`,
              backgroundSize: '200% 100%',
              animation: `${shimmer} 2.5s infinite`,
              opacity: 0,
              transition: 'opacity 0.25s',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
          <BrushIcon
            className="brush-icon"
            sx={{
              fontSize: { xs: '1.3rem', sm: '1.4rem' },
              color: 'primary.main',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '0.9rem', sm: '1rem' },
              lineHeight: 1.3,
              color: 'text.primary',
            }}
          >
            {CHAT_TEXT.EMPTY_STATE.SUBHEADER}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};


