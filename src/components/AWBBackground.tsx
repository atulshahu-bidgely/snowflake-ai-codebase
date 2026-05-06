import React from 'react';
import { Box, Typography } from '@mui/material';

const BLUE = '#1d5ed8';
const RED = '#e4194b';
const TABS = ['Location', 'Account', 'Premise', 'Appliance Targeting', 'Load Research', 'EV Analytics', 'Grid Asset', 'Custom'];
const SUB_TABS = ['EV Maps', 'Income'];

export const AWBBackground: React.FC = () => (
  <Box
    sx={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: '#f4f6fa',
      userSelect: 'none',
      pointerEvents: 'none',
    }}
  >
    {/* ── Navbar (48px) ── */}
    <Box
      sx={{
        height: 48,
        flexShrink: 0,
        position: 'relative',
        backgroundImage: 'url(/images/awb-navbar.png)',
        backgroundSize: '100% 100%',
        borderBottom: `2px solid ${RED}`,
        display: 'flex',
        alignItems: 'center',
        px: 3,
        gap: 2,
      }}
    >
      {/* Bidgely logo text placeholder */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0 }}>
        <Typography sx={{ color: 'white', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
          ANALYTICS WORKBENCH
        </Typography>
      </Box>
    </Box>

    {/* ── Stats bar (86px) ── */}
    <Box
      sx={{
        height: 86,
        flexShrink: 0,
        bgcolor: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        borderBottom: '1px solid #d0d6e7',
      }}
    >
      {/* Left: stat cards */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {[
          { label: 'Bidgely IDs', value: '8,821', sub: 'Customers ▾  7,332' },
          { label: 'Avg Consumption ▾', value: '772 GWh' },
          { label: 'Solar Generation', value: '772 GWh' },
        ].map((card, i) => (
          <Box
            key={i}
            sx={{
              border: '1px solid #d0d6e7',
              borderRadius: '6px',
              px: 2,
              py: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: i === 0 ? 180 : 140,
            }}
          >
            <Typography sx={{ fontSize: 13, color: '#565e6e', lineHeight: '1.3', fontFamily: 'Roboto, sans-serif' }}>
              {card.label}
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#1e232e', fontFamily: 'Roboto, sans-serif', lineHeight: '24px' }}>
              {card.value}
            </Typography>
            {card.sub && (
              <Typography sx={{ fontSize: 11, color: '#565e6e', fontFamily: 'Roboto, sans-serif' }}>
                {card.sub}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Right: filters */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {['Resi - AMI - Electric', '19 Feb 2021 - 19 Feb 2021'].map((label, i) => (
          <Box key={i} sx={{ bgcolor: '#f4f6fa', borderRadius: '6px', px: 1.5, py: 1 }}>
            <Typography sx={{ fontSize: 14, color: '#1e232e', fontFamily: 'Roboto, sans-serif' }}>{label}</Typography>
          </Box>
        ))}
        <Box sx={{ bgcolor: '#f4f6fa', borderRadius: '6px', px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 14, color: '#1e232e', fontFamily: 'Roboto, sans-serif' }}>⊫</Typography>
          <Box sx={{ bgcolor: '#06090e', borderRadius: '2px', px: '4px', py: '1px' }}>
            <Typography sx={{ fontSize: 11, color: 'white', fontWeight: 600, fontFamily: 'Roboto, sans-serif' }}>22</Typography>
          </Box>
        </Box>
      </Box>
    </Box>

    {/* ── Tab bar (60px) ── */}
    <Box
      sx={{
        height: 60,
        flexShrink: 0,
        bgcolor: 'white',
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid #d0d6e7',
        px: 3,
      }}
    >
      {TABS.map((tab, i) => (
        <Box
          key={tab}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 4,
            borderBottom: i === 0 ? `2px solid ${RED}` : 'none',
            bgcolor: i === 0 ? 'white' : '#eff5ff',
            minWidth: tab.length > 12 ? 'auto' : 150,
          }}
        >
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 500,
              color: BLUE,
              fontFamily: 'Roboto, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </Typography>
        </Box>
      ))}
    </Box>

    {/* ── Sub-tab bar (52px) ── */}
    <Box
      sx={{
        height: 52,
        flexShrink: 0,
        bgcolor: 'white',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        borderBottom: '1px solid #d0d6e7',
        px: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Home icon tab */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 56, borderBottom: `2px solid ${RED}`, bgcolor: 'white',
        }}>
          <Typography sx={{ fontSize: 18 }}>⌂</Typography>
        </Box>
        {SUB_TABS.map(tab => (
          <Box key={tab} sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            px: 4, bgcolor: '#eff5ff', minWidth: 120,
          }}>
            <Typography sx={{ fontSize: 15, fontWeight: 500, color: BLUE, fontFamily: 'Roboto, sans-serif' }}>
              {tab}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography sx={{ fontSize: 12, color: '#727888', fontFamily: 'Roboto, sans-serif' }}>just now ↻</Typography>
      </Box>
    </Box>

    {/* ── Map content area ── */}
    <Box sx={{ flex: 1, position: 'relative', p: '16px 24px' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: '16px 24px',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0px 0px 2px rgba(40,41,61,0.04), 0px 2px 8px rgba(96,97,112,0.16)',
          backgroundImage: 'url(/images/awb-map.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      />
    </Box>
  </Box>
);
