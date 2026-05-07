import React from 'react';
import { Box, Typography, Paper, Link, Divider } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// explicit tokens — no theme inheritance, light mode only
const TEXT    = '#1E293B';   // Slate-800  — headings & strong
const BODY    = '#374151';   // Gray-700   — body text (contrast 9.7:1 on #fff)
const BLUE    = '#2563EB';   // Primary
const BORDER  = '#E2E8F0';   // Slate-200
const CODE_BG = '#F1F5F9';   // Slate-100
const TH_BG   = '#EFF6FF';   // Blue-50
const TH_BD   = '#BFDBFE';   // Blue-200
const TH_TEXT = '#1D4ED8';   // Blue-700

const BASE_SIZE = { xs: '0.9rem', sm: '0.9375rem' };

interface MarkdownFormatterProps {
  content: string;
}

export const MarkdownFormatter: React.FC<MarkdownFormatterProps> = ({ content }) => {
  if (!content) return null;

  return (
    <Box sx={{ color: TEXT }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <Typography
              sx={{
                fontSize: BASE_SIZE,
                lineHeight: 1.75,
                color: BODY,
                mb: 1.5,
                '&:last-child': { mb: 0 },
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {children}
            </Typography>
          ),

          h1: ({ children }) => (
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: TEXT, mt: 2.5, mb: 1, lineHeight: 1.3 }}>
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: TEXT, mt: 2, mb: 0.75, lineHeight: 1.35 }}>
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: TEXT, mt: 1.75, mb: 0.5, lineHeight: 1.4 }}>
              {children}
            </Typography>
          ),
          h4: ({ children }) => (
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: TEXT, mt: 1.5, mb: 0.5 }}>
              {children}
            </Typography>
          ),

          strong: ({ children }) => (
            <Typography component="span" sx={{ fontWeight: 700, color: TEXT, fontSize: 'inherit' }}>
              {children}
            </Typography>
          ),
          em: ({ children }) => (
            <Typography component="span" sx={{ fontStyle: 'italic', fontSize: 'inherit', color: 'inherit' }}>
              {children}
            </Typography>
          ),

          hr: () => <Divider sx={{ my: 2, borderColor: BORDER }} />,

          blockquote: ({ children }) => (
            <Box
              sx={{
                borderLeft: `3px solid ${BLUE}60`,
                pl: 2, ml: 0, my: 1.5,
                py: 0.5,
                bgcolor: '#F8FAFC',
                borderRadius: '0 6px 6px 0',
                color: '#475569',
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
                m: 0, pl: 2.5, mb: 1.5,
                '& li': { mb: 0.5, fontSize: BASE_SIZE, lineHeight: 1.7, color: BODY },
              }}
            >
              {children}
            </Box>
          ),
          ol: ({ children }) => (
            <Box
              component="ol"
              sx={{
                m: 0, pl: 2.5, mb: 1.5,
                '& li': { mb: 0.5, fontSize: BASE_SIZE, lineHeight: 1.7, color: BODY },
              }}
            >
              {children}
            </Box>
          ),
          li: ({ children }) => (
            <Typography
              component="li"
              sx={{ fontSize: BASE_SIZE, lineHeight: 1.7, color: BODY, mb: 0.5, '&:last-child': { mb: 0 }, wordWrap: 'break-word' }}
            >
              {children}
            </Typography>
          ),

          // ── Tables ───────────────────────────────────────────
          table: ({ children }) => (
            <Box sx={{ overflowX: 'auto', mb: 2, mt: 0.5, borderRadius: '10px', border: `1px solid ${BORDER}` }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: { xs: '0.8rem', sm: '0.875rem' }, lineHeight: 1.5 }}>
                {children}
              </Box>
            </Box>
          ),
          thead: ({ children }) => (
            <Box component="thead" sx={{ bgcolor: TH_BG, borderBottom: `2px solid ${TH_BD}` }}>
              {children}
            </Box>
          ),
          tbody: ({ children }) => (
            <Box
              component="tbody"
              sx={{
                '& tr:nth-of-type(even)': { bgcolor: '#F8FAFC' },
                '& tr:hover': { bgcolor: TH_BG, transition: 'background-color 0.15s' },
                '& tr:last-child td': { borderBottom: 'none' },
              }}
            >
              {children}
            </Box>
          ),
          tr: ({ children }) => (
            <Box component="tr" sx={{ borderBottom: `1px solid ${BORDER}` }}>
              {children}
            </Box>
          ),
          th: ({ children }) => (
            <Box
              component="th"
              sx={{
                px: 2, py: 1,
                textAlign: 'left',
                fontWeight: 600,
                color: TH_TEXT,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                whiteSpace: 'nowrap',
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
                px: 2, py: 0.875,
                color: BODY,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                fontVariantNumeric: 'tabular-nums',
                wordBreak: 'break-word',
              }}
            >
              {children}
            </Box>
          ),
          // ─────────────────────────────────────────────────────

          code: ({ children, inline }: any) =>
            inline ? (
              <Typography
                component="code"
                sx={{
                  bgcolor: CODE_BG,
                  px: '5px', py: '2px',
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  fontFamily: '"Fira Code", "Cascadia Code", monospace',
                  color: TEXT,
                  border: `1px solid ${BORDER}`,
                }}
              >
                {children}
              </Typography>
            ) : (
              <Paper
                elevation={0}
                sx={{
                  p: 1.5, mb: 1.5,
                  bgcolor: CODE_BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 1.5,
                  overflowX: 'auto',
                }}
              >
                <Typography
                  component="pre"
                  sx={{
                    m: 0,
                    fontSize: '0.85em',
                    fontFamily: '"Fira Code", "Cascadia Code", monospace',
                    lineHeight: 1.6,
                    color: TEXT,
                    whiteSpace: 'pre',
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
              sx={{ color: BLUE, fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              {children}
            </Link>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};
