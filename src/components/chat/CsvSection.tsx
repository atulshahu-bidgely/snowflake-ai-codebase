import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material';
import {
  Download as DownloadIcon,
  TableChart as PreviewIcon,
  KeyboardArrowUp as CollapseIcon,
} from '@mui/icons-material';
const BORDER    = '#E2E8F0';
const TEXT      = '#1E293B';
const TEXT2     = '#64748B';
const GREEN     = '#059669';
const GREEN_BG  = '#ECFDF5';
const GREEN_BD  = '#A7F3D0';

const PREVIEW_LIMIT = 15;

interface CsvSectionProps {
  headers: string[];
  rows: string[][];
  totalCount?: number;
  filename?: string;
}

export const CsvSection: React.FC<CsvSectionProps> = ({
  headers,
  rows,
  totalCount,
  filename = `target_candidates_${new Date().toISOString().slice(0, 10)}.csv`,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (headers.length === 0 || rows.length === 0) return null;

  const handleDownload = () => {
    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...rows.map(row => row.map(escape).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        mt: 1.5,
        border: `1px solid ${GREEN_BD}`,
        borderRadius: '10px',
        bgcolor: GREEN_BG,
        overflow: 'hidden',
      }}
    >
      {/* ── Toolbar ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: previewOpen ? `1px solid ${GREEN_BD}` : 'none',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PreviewIcon sx={{ fontSize: 15, color: GREEN }} />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: GREEN }}>
            {totalCount && totalCount > rows.length
              ? `Top ${rows.length} of ${totalCount.toLocaleString()} matched`
              : `${rows.length} candidate${rows.length !== 1 ? 's' : ''} found`}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: TEXT2 }}>
            · {headers.length} columns
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={previewOpen ? 'Hide preview' : 'Preview table'} arrow>
            <IconButton
              size="small"
              onClick={() => setPreviewOpen(v => !v)}
              sx={{
                fontSize: '0.75rem',
                color: TEXT2,
                px: 1,
                py: 0.5,
                borderRadius: '6px',
                gap: '4px',
                '&:hover': { bgcolor: GREEN_BD, color: GREEN },
              }}
            >
              {previewOpen
                ? <CollapseIcon sx={{ fontSize: 15 }} />
                : <PreviewIcon sx={{ fontSize: 15 }} />}
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                {previewOpen ? 'Hide' : 'Preview'}
              </Typography>
            </IconButton>
          </Tooltip>

          <Tooltip title="Download as CSV" arrow>
            <IconButton
              size="small"
              onClick={handleDownload}
              sx={{
                fontSize: '0.75rem',
                color: 'white',
                bgcolor: GREEN,
                px: 1,
                py: 0.5,
                borderRadius: '6px',
                gap: '4px',
                '&:hover': { bgcolor: '#047857' },
              }}
            >
              <DownloadIcon sx={{ fontSize: 15 }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                Download CSV
              </Typography>
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Preview table ── */}
      <Collapse in={previewOpen}>
        <TableContainer sx={{ maxHeight: 320 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {headers.map((h, i) => (
                  <TableCell
                    key={i}
                    sx={{
                      bgcolor: '#D1FAE5',
                      color: '#065F46',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      py: 0.75,
                      borderBottom: `1px solid ${GREEN_BD}`,
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.slice(0, PREVIEW_LIMIT).map((row, ri) => (
                <TableRow
                  key={ri}
                  sx={{ '&:hover': { bgcolor: '#ECFDF5' }, bgcolor: ri % 2 === 0 ? 'white' : '#F0FDF4' }}
                >
                  {row.map((cell, ci) => (
                    <TableCell
                      key={ci}
                      sx={{
                        fontSize: '0.78rem',
                        color: TEXT,
                        py: 0.75,
                        borderBottom: `1px solid ${BORDER}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(rows.length > PREVIEW_LIMIT || (totalCount && totalCount > rows.length)) && (
          <Box sx={{ px: 2, py: 0.75, borderTop: `1px solid ${GREEN_BD}` }}>
            <Typography sx={{ fontSize: '0.72rem', color: TEXT2, fontStyle: 'italic' }}>
              {rows.length > PREVIEW_LIMIT
                ? `Showing ${PREVIEW_LIMIT} of ${rows.length} rows in preview`
                : ''}
              {totalCount && totalCount > rows.length
                ? ` · CSV contains top ${rows.length} records — full list of ${totalCount.toLocaleString()} matched`
                : ''}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};
