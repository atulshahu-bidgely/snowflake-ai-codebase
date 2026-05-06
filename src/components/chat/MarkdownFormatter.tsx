import React from 'react';
import { Box, Typography, Paper, Link, Divider, alpha, Theme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownFormatterProps {
  content: string;
  theme: Theme;
}

export const MarkdownFormatter: React.FC<MarkdownFormatterProps> = ({ content, theme }) => {
  if (!content) return null;

  const baseFontSize = { xs: '0.9rem', sm: '1rem' };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.7,
              fontSize: baseFontSize,
              mb: 1.5,
              '&:last-child': { mb: 0 },
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              hyphens: 'auto',
            }}
          >
            {children}
          </Typography>
        ),

        h1: ({ children }) => (
          <Typography variant="h5" sx={{ fontWeight: 700, mt: 2, mb: 1, color: 'text.primary' }}>
            {children}
          </Typography>
        ),
        h2: ({ children }) => (
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 1, color: 'text.primary' }}>
            {children}
          </Typography>
        ),
        h3: ({ children }) => (
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, mt: 1.5, mb: 0.75, color: 'text.primary' }}>
            {children}
          </Typography>
        ),
        h4: ({ children }) => (
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, mt: 1.5, mb: 0.5, color: 'text.primary' }}>
            {children}
          </Typography>
        ),

        strong: ({ children }) => (
          <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 'inherit' }}>
            {children}
          </Typography>
        ),

        em: ({ children }) => (
          <Typography component="span" sx={{ fontStyle: 'italic', fontSize: 'inherit' }}>
            {children}
          </Typography>
        ),

        hr: () => <Divider sx={{ my: 2 }} />,

        blockquote: ({ children }) => (
          <Box
            sx={{
              borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.5)}`,
              pl: 2,
              ml: 0,
              my: 1.5,
              color: 'text.secondary',
              fontStyle: 'italic',
            }}
          >
            {children}
          </Box>
        ),

        ul: ({ children }) => (
          <Box
            component="ul"
            sx={{
              margin: 0,
              paddingLeft: 2.5,
              mb: 1.5,
              '& li': {
                marginBottom: 0.5,
                fontSize: baseFontSize,
                lineHeight: 1.7,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              },
            }}
          >
            {children}
          </Box>
        ),

        ol: ({ children }) => (
          <Box
            component="ol"
            sx={{
              margin: 0,
              paddingLeft: 2.5,
              mb: 1.5,
              '& li': {
                marginBottom: 0.5,
                fontSize: baseFontSize,
                lineHeight: 1.7,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              },
            }}
          >
            {children}
          </Box>
        ),

        li: ({ children }) => (
          <Typography
            component="li"
            sx={{
              fontSize: baseFontSize,
              lineHeight: 1.7,
              mb: 0.5,
              '&:last-child': { mb: 0 },
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {children}
          </Typography>
        ),

        // ── Tables (critical for analytics output) ──────────────────
        table: ({ children }) => (
          <Box
            sx={{
              overflowX: 'auto',
              mb: 2,
              mt: 0.5,
              borderRadius: 1.5,
              border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              boxShadow: `0 1px 4px ${alpha(theme.palette.grey[500], 0.08)}`,
            }}
          >
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                lineHeight: 1.5,
              }}
            >
              {children}
            </Box>
          </Box>
        ),

        thead: ({ children }) => (
          <Box
            component="thead"
            sx={{
              backgroundColor: alpha(theme.palette.primary.main, 0.06),
              borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            {children}
          </Box>
        ),

        tbody: ({ children }) => (
          <Box
            component="tbody"
            sx={{
              '& tr:nth-of-type(even)': {
                backgroundColor: alpha(theme.palette.grey[500], 0.03),
              },
              '& tr:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
                transition: 'background-color 0.15s ease',
              },
              '& tr:last-child td': {
                borderBottom: 'none',
              },
            }}
          >
            {children}
          </Box>
        ),

        tr: ({ children }) => (
          <Box component="tr" sx={{ borderBottom: `1px solid ${alpha(theme.palette.divider, 0.4)}` }}>
            {children}
          </Box>
        ),

        th: ({ children }) => (
          <Box
            component="th"
            sx={{
              px: 2,
              py: 1,
              textAlign: 'left',
              fontWeight: 600,
              color: 'text.primary',
              whiteSpace: 'nowrap',
              fontSize: { xs: '0.8rem', sm: '0.875rem' },
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {children}
          </Box>
        ),

        td: ({ children }) => (
          <Box
            component="td"
            sx={{
              px: 2,
              py: 0.875,
              color: 'text.primary',
              fontSize: { xs: '0.8rem', sm: '0.875rem' },
              fontVariantNumeric: 'tabular-nums',
              wordBreak: 'break-word',
            }}
          >
            {children}
          </Box>
        ),
        // ────────────────────────────────────────────────────────────

        code: ({ children, inline }: any) =>
          inline ? (
            <Typography
              component="code"
              sx={{
                backgroundColor: alpha(theme.palette.grey[500], 0.1),
                padding: '2px 6px',
                borderRadius: 0.5,
                fontSize: '0.875em',
                fontFamily: '"Fira Code", "Cascadia Code", monospace',
                color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#1e293b',
              }}
            >
              {children}
            </Typography>
          ) : (
            <Paper
              sx={{
                p: 1.5,
                mb: 1.5,
                backgroundColor: alpha(theme.palette.grey[500], 0.08),
                border: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                borderRadius: 1.5,
                overflowX: 'auto',
              }}
            >
              <Typography
                component="pre"
                sx={{
                  margin: 0,
                  fontSize: '0.875em',
                  fontFamily: '"Fira Code", "Cascadia Code", monospace',
                  lineHeight: 1.6,
                }}
              >
                {children}
              </Typography>
            </Paper>
          ),

        a: ({ href, children }) => (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {children}
          </Link>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};


