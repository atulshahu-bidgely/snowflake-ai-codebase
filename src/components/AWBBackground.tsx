import React from 'react';
import { Box } from '@mui/material';

export const AWBBackground: React.FC = () => (
  <Box
    sx={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      userSelect: 'none',
      pointerEvents: 'none',
      zIndex: 0,
    }}
  >
    <Box
      component="img"
      src="/images/landing-bg.png"
      alt=""
      sx={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'top center',
        display: 'block',
      }}
    />
  </Box>
);
