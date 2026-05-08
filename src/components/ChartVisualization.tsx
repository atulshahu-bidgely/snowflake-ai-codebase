import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  alpha
} from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot
} from 'recharts';
import { ChartVisualizationProps, VegaLiteSpec, RechartsData, CHART_COLORS } from '../types/chart';

const ChartVisualization: React.FC<ChartVisualizationProps> = ({ 
  chartContent, 
  height = 380 
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Parse chart data from various formats
  const parseChartData = (chartSpec: any): { 
    type: string; 
    data: RechartsData[]; 
    originalData: RechartsData[];
    title?: string;
  } => {
    try {
      // Handle Vega-Lite specifications (primary format)
      // Check for Vega-Lite by: $schema, or presence of required Vega-Lite fields
      const hasVegaLiteSchema = chartSpec.$schema && chartSpec.$schema.includes('vega-lite');
      const hasVegaLiteFields = chartSpec.mark && chartSpec.data && chartSpec.data.values;
      
      if (hasVegaLiteSchema || hasVegaLiteFields) {
        const vegaSpec = chartSpec as VegaLiteSpec;
        const data = vegaSpec.data.values;
        const mark = typeof vegaSpec.mark === 'string' ? vegaSpec.mark : vegaSpec.mark.type;
        
        // Store original data for table view
        const originalData = data.map((item: any, index: number) => ({ 
          id: index, 
          ...item 
        }));

        // Transform data for chart rendering
        let transformedData = [...data];

        // Handle multi-series line charts (convert from long to wide format)
        if (mark === 'line' && data.length > 0) {
          const firstItem = data[0];
          const keys = Object.keys(firstItem);

          // Read Vega-Lite encoding hints — these are authoritative when present
          const encodingColorField = vegaSpec.encoding?.color?.field;
          const encodingXField = vegaSpec.encoding?.x?.field;
          const encodingYField = vegaSpec.encoding?.y?.field;

          // Detect category/series field (e.g. ZIP, region, product)
          // Primary: use Vega-Lite encoding.color.field (authoritative when present).
          // Fallback: match by field name only — no value-range guessing which
          // would false-positive on kWh/revenue fields.
          const categoryField =
            (encodingColorField && keys.includes(encodingColorField) ? encodingColorField : null) ||
            keys.find(key =>
              key.toUpperCase() === 'CATEGORY' ||
              key.toLowerCase().includes('category') ||
              key.toLowerCase().includes('group') ||
              key.toLowerCase().includes('series') ||
              key.toLowerCase() === 'zip' ||
              key.toLowerCase().includes('zip_code') ||
              key.toLowerCase().includes('zipcode') ||
              key.toLowerCase().includes('postal') ||
              key.toLowerCase().includes('region') ||
              key.toLowerCase().includes('segment') ||
              key.toLowerCase().includes('district') ||
              key.toLowerCase().includes('territory')
            );

          // Detect time/X field
          const timeField =
            (encodingXField && keys.includes(encodingXField) && encodingXField !== categoryField
              ? encodingXField
              : null) ||
            keys.find(key =>
              key !== categoryField &&
              (key.toLowerCase().includes('month') ||
                key.toLowerCase().includes('date') ||
                key.toLowerCase().includes('time') ||
                key.toLowerCase().includes('year') ||
                key.toLowerCase().includes('day') ||
                key.toLowerCase().includes('quarter') ||
                key.toLowerCase().includes('week') ||
                (typeof firstItem[key] === 'string' && (
                  firstItem[key].includes('-') ||
                  firstItem[key].includes('/') ||
                  firstItem[key].match(/^\d{4}$/)
                )))
            );

          // Detect value/Y field
          const valueField =
            (encodingYField && keys.includes(encodingYField) &&
              encodingYField !== categoryField && encodingYField !== timeField
              ? encodingYField
              : null) ||
            keys.find(key =>
              key !== categoryField &&
              key !== timeField &&
              (key.toLowerCase().includes('sales') ||
                key.toLowerCase().includes('value') ||
                key.toLowerCase().includes('amount') ||
                key.toLowerCase().includes('revenue') ||
                key.toLowerCase().includes('price') ||
                key.toLowerCase().includes('cost') ||
                key.toLowerCase().includes('total') ||
                key.toLowerCase().includes('count') ||
                key.toLowerCase().includes('quantity') ||
                key.toLowerCase().includes('score') ||
                key.toLowerCase().includes('rating') ||
                key.toLowerCase().includes('percent') ||
                typeof firstItem[key] === 'number')
            );

          if (categoryField && timeField && valueField) {
            // Pivot the data from long to wide format
            const pivotMap = new Map();

            data.forEach((row: any) => {
              const timeKey = row[timeField];
              const category = row[categoryField];
              const value = parseFloat(row[valueField]) || 0;

              if (!pivotMap.has(timeKey)) {
                pivotMap.set(timeKey, {
                  name: timeKey,
                  [timeField]: timeKey
                });
              }

              // Label month numbers as "Month 6" etc. for readable series names
              const categoryKey =
                categoryField.toLowerCase().includes('month') &&
                (typeof category === 'number' || /^\d{1,2}$/.test(String(category)))
                  ? `Month ${category}`
                  : String(category);
              pivotMap.get(timeKey)[categoryKey] = value;
            });

            transformedData = Array.from(pivotMap.values());
          }
        }

        // Add normalized field names and ensure we have name/id fields
        transformedData = transformedData.map((item: any, index: number) => {
          const normalizedItem = { id: index, ...item };
          
          // Add lowercase versions of field names for consistent access
          Object.keys(item).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (lowerKey !== key && !normalizedItem[lowerKey]) {
              normalizedItem[lowerKey] = item[key];
            }
          });
          
          // Ensure we have a 'name' field for charts
          if (!normalizedItem.name && !normalizedItem.NAME) {
            const nameFields = Object.keys(normalizedItem).filter(key => 
              typeof normalizedItem[key] === 'string' ||
              key.toLowerCase().includes('name') ||
              key.toLowerCase().includes('month') ||
              key.toLowerCase().includes('date')
            );
            if (nameFields.length > 0) {
              normalizedItem.name = normalizedItem[nameFields[0]];
            }
          }
          
          return normalizedItem;
        });

        return {
          type: mark || 'bar',
          data: transformedData,
          originalData,
          title: vegaSpec.title
        };
      }

      // Handle generic chart specifications
      if (chartSpec.type && chartSpec.data) {
        const originalData = chartSpec.data.map((item: any, index: number) => ({ 
          id: index, 
          ...item 
        }));
        return {
          type: chartSpec.type,
          data: chartSpec.data,
          originalData,
          title: chartSpec.title
        };
      }

      // Handle direct data arrays
      if (Array.isArray(chartSpec)) {
        const originalData = chartSpec.map((item: any, index: number) => ({ 
          id: index, 
          ...item 
        }));
        return {
          type: 'bar',
          data: chartSpec,
          originalData,
          title: 'Chart'
        };
      }

      // Fallback
      return {
        type: 'bar',
        data: [],
        originalData: [],
        title: 'No Data Available'
      };
    } catch (error) {
      return {
        type: 'bar',
        data: [],
        originalData: [],
        title: 'Chart Parse Error'
      };
    }
  };

  const { type, data, originalData, title } = useMemo(() => {
    return parseChartData(chartContent.chart_spec);
  }, [chartContent]);

  // Auto-detect fields for rendering
  const chartConfig = useMemo(() => {
    if (!data || data.length === 0) {
      return { xKey: '', yKeys: [] };
    }

    const dataKeys = Object.keys(data[0] || {});
    
    // Auto-detect X-axis field (temporal/categorical) - generic approach
    let xKey = dataKeys.find(key =>
      key.toLowerCase().includes('month') ||
      key.toLowerCase().includes('date') ||
      key.toLowerCase().includes('timestamp') ||
      key.toLowerCase().includes('datetime') ||
      key.toLowerCase().includes('time_') ||
      key.toLowerCase().includes('_time') ||
      key.toLowerCase() === 'time' ||
      key.toLowerCase().includes('year') ||
      key.toLowerCase().includes('quarter') ||
      key.toLowerCase().includes('week') ||
      key.toLowerCase().includes('day') ||
      key.toLowerCase() === 'hour' ||
      key === 'name' ||
      key.toLowerCase().includes('category') ||
      key.toLowerCase().includes('group') ||
      key.toLowerCase().includes('type') ||
      key.toLowerCase().includes('label') ||
      key.toLowerCase().includes('ticker') ||
      key.toLowerCase().includes('primary_ticker') ||
      (typeof data[0]?.[key] === 'string')
    );
    
    
    // Fallback to first string field or 'name'
    if (!xKey) {
      xKey = dataKeys.find(key => typeof data[0]?.[key] === 'string') || 'name';
    }

    // Auto-detect Y-axis fields (numeric values, excluding metadata)
    let yKeys = dataKeys.filter(key => {
      const isNotXKey = key !== xKey;
      const isNotName = key !== 'name';
      const isNotId = key !== 'id';
      const hasNoDate = !key.toLowerCase().includes('date');
      // Be more specific about time fields to avoid excluding "sentiment" fields
      const hasNoTime = !(
        key.toLowerCase().includes('timestamp') ||
        key.toLowerCase().includes('datetime') ||
        key.toLowerCase().includes('time_') ||
        key.toLowerCase().includes('_time') ||
        key.toLowerCase() === 'time'
      );
      const hasNoMonth = !key.toLowerCase().includes('month');
      const hasNoYear = !key.toLowerCase().includes('year');
      const isNumeric = typeof data[0]?.[key] === 'number' || !isNaN(Number(data[0]?.[key]));
      
      return isNotXKey && isNotName && isNotId && hasNoDate && hasNoTime && hasNoMonth && hasNoYear && isNumeric;
    });
    
    // Filter out metadata and system fields (generic patterns)
    // BUT preserve actual data fields like AVG_SENTIMENT_SCORE, MONTHLY_SALES, etc.
    const excludePatterns = [
      // Only exclude clearly administrative/metadata fields
      /^id$/i,
      /^name$/i,
      /^label$/i,
      /^key$/i,
      /timestamp/i,
      /created/i,
      /updated/i,
      /_id$/i,
      /_key$/i,
      // Exclude count_distinct but not other aggregates that might be data
      /count_distinct/i,
      /COUNT_DISTINCT/i,
      // Exclude geographic/categorical identifier fields that are numeric-looking
      /^zip$/i,
      /zip_code/i,
      /zipcode/i,
      /^postal$/i,
      /postal_code/i
    ];

    yKeys = yKeys.filter(key => {
      return !excludePatterns.some(pattern => pattern.test(key));
    });

    // Remove case-insensitive duplicates
    const seen = new Set<string>();
    yKeys = yKeys.filter(key => {
      const lowerKey = key.toLowerCase();
      if (seen.has(lowerKey)) {
        return false;
      }
      seen.add(lowerKey);
      return true;
    });

    return { xKey, yKeys };
  }, [data]);

  // Sort data by X axis when it looks temporal — uses the same xKey the XAxis renders,
  // so this always sorts what's actually displayed regardless of Vega-Lite spec completeness.
  const sortedData = useMemo(() => {
    const { xKey } = chartConfig;
    if (!data || data.length <= 1 || !xKey) return data;
    const sampleVal = data[0]?.[xKey];
    // ISO date string — lexicographic order matches chronological order
    if (typeof sampleVal === 'string' && (
      /^\d{4}-\d{2}/.test(sampleVal) ||
      /^\d{4}$/.test(sampleVal) ||
      /^\d{4}\//.test(sampleVal)
    )) {
      return [...data].sort((a, b) =>
        String(a[xKey] ?? '').localeCompare(String(b[xKey] ?? ''))
      );
    }
    // Numeric X (hours, ordinal labels) — sort ascending
    if (typeof sampleVal === 'number') {
      return [...data].sort((a, b) => (a[xKey] as number) - (b[xKey] as number));
    }
    return data;
  }, [data, chartConfig]);

  const isMultiSeries = chartConfig.yKeys.length > 1;
  const tabs = isMultiSeries ? ['Trend', 'Compare', 'Table'] : ['Chart', 'Table'];

  // Peak value per series (for Trend annotations)
  const peaks = useMemo(() => {
    const { xKey, yKeys } = chartConfig;
    if (!sortedData || sortedData.length === 0 || !isMultiSeries) return [];
    return yKeys.map((key, i) => {
      let maxVal = -Infinity;
      let maxX: any = null;
      sortedData.forEach(row => {
        const v = typeof row[key] === 'number' ? (row[key] as number) : NaN;
        if (!isNaN(v) && v > maxVal) { maxVal = v; maxX = row[xKey]; }
      });
      return { key, maxVal, maxX, color: CHART_COLORS[i % CHART_COLORS.length] };
    }).filter(p => p.maxX !== null);
  }, [sortedData, chartConfig, isMultiSeries]);

  // Key insights for multi-series data
  const insights = useMemo(() => {
    const { xKey, yKeys } = chartConfig;
    if (!sortedData || sortedData.length < 2 || yKeys.length < 1) return null;

    // Highest single value
    let highestVal = -Infinity;
    let highestKey = '';
    let highestX: any = null;
    yKeys.forEach(key => {
      sortedData.forEach(row => {
        const v = row[key] as number;
        if (typeof v === 'number' && v > highestVal) { highestVal = v; highestKey = key; highestX = row[xKey]; }
      });
    });

    // Fastest single-step growth
    let fastestGrowth = 0;
    let fastestKey = '';
    let fastestFromX: any = null;
    let fastestToX: any = null;
    yKeys.forEach(key => {
      for (let i = 0; i < sortedData.length - 1; i++) {
        const diff = (sortedData[i + 1][key] as number) - (sortedData[i][key] as number);
        if (typeof diff === 'number' && diff > fastestGrowth) {
          fastestGrowth = diff; fastestKey = key;
          fastestFromX = sortedData[i][xKey]; fastestToX = sortedData[i + 1][xKey];
        }
      }
    });

    // Most consistent series (smallest value range)
    let smallestRange = Infinity;
    let consistentKey = '';
    yKeys.forEach(key => {
      const vals = sortedData.map(row => row[key] as number).filter(v => typeof v === 'number' && !isNaN(v));
      if (vals.length === 0) return;
      const range = Math.max(...vals) - Math.min(...vals);
      if (range < smallestRange) { smallestRange = range; consistentKey = key; }
    });

    return { highestVal, highestKey, highestX, fastestGrowth, fastestKey, fastestFromX, fastestToX, consistentKey, smallestRange };
  }, [sortedData, chartConfig]);

  // Shared date label formatter — strips timestamp when time is midnight,
  // shows hour only when the data actually has sub-day granularity.
  const formatDateLabel = (value: any): string => {
    if (!value || typeof value !== 'string' || !value.includes('-')) return value;

    // Detect whether a time component is present (space or T separator)
    const separator = value.includes('T') ? 'T' : (value.includes(' ') ? ' ' : null);
    let datePart = value;
    let hasNonZeroHour = false;
    let hourValue = 0;

    if (separator) {
      datePart = value.split(separator)[0];
      const timePart = value.split(separator)[1] || '';
      // Strip fractional seconds / timezone before parsing hour
      hourValue = parseInt(timePart.split(':')[0], 10) || 0;
      hasNonZeroHour = hourValue !== 0;
    }

    const parts = datePart.split('-');
    if (parts.length < 3) return value;
    const year  = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day   = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return value;

    const dateObj = new Date(year, month, day);

    if (hasNonZeroHour) {
      // Hourly granularity — show date + hour
      const ampm   = hourValue >= 12 ? 'PM' : 'AM';
      const hour12 = hourValue % 12 || 12;
      return `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hour12}${ampm}`;
    }

    // Date-only: use day-of-month to infer granularity
    if (day === 1) {
      // Monthly data — show "Mar 2023"
      return dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    // Daily data — show "Mar 1, 2023"
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Tooltip value formatter — pretty-prints field names and numbers
  const customTooltipFormatter = (value: any, name: any): any => {
    let formattedName = (name as string)
      .replace(/_/g, ' ')
      .replace(/\bCOUNT\b/gi, 'Count')
      .replace(/\bREGISTRATION\b/gi, 'Registration')
      .replace(/\bTOTAL\b/gi, 'Total')
      .replace(/\bAVG\b/gi, 'Average')
      .replace(/\bSUM\b/gi, 'Sum')
      .replace(/\bMAX\b/gi, 'Maximum')
      .replace(/\bMIN\b/gi, 'Minimum')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());
    return typeof value === 'number'
      ? [value.toLocaleString(), formattedName]
      : [value, formattedName];
  };

  // Generate legend items for display above chart
  const renderLegendItems = () => {
    const { yKeys } = chartConfig;
    
    if (!yKeys || yKeys.length === 0) return null;
    
    return (
      <Box sx={{ 
        display: 'flex', 
        gap: 2, 
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        mb: 2,
        pb: 1,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
      }}>
        {yKeys.map((key, index) => (
          <Box 
            key={key}
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1 
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '3px',
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                flexShrink: 0
              }}
            />
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'text.primary'
              }}
            >
              {key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  // Render appropriate chart based on type
  const renderChart = () => {
    if (!sortedData || sortedData.length === 0) {
      return (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: height,
          color: 'text.secondary'
        }}>
          <Typography variant="body1">No data available for visualization</Typography>
        </Box>
      );
    }

    const { xKey, yKeys } = chartConfig;

    switch (type) {
      case 'line':
        return (
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={sortedData} margin={{ top: 20, right: 70, left: 0, bottom: 5 }} style={{ overflow: 'visible' }}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={alpha(theme.palette.divider, 0.3)}
                horizontal={true}
                vertical={false}
              />
              <XAxis
                dataKey={xKey}
                stroke={theme.palette.text.secondary}
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={55}
                tickFormatter={formatDateLabel}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={11}
                tickFormatter={(value) => {
                  if (typeof value === 'number') {
                    if (value >= 1000000) {
                      return `${(value / 1000000).toFixed(1)}M`;
                    } else if (value >= 1000) {
                      return `${(value / 1000).toFixed(0)}K`;
                    }
                    return value.toLocaleString();
                  }
                  return value;
                }}
                domain={['dataMin * 0.95', 'dataMax * 1.1']}
                width={70}
              />
              <Tooltip 
                formatter={customTooltipFormatter}
                labelFormatter={formatDateLabel}
                contentStyle={{
                  backgroundColor: alpha(theme.palette.background.paper, 0.95),
                  border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  borderRadius: '4px',
                  boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.15)}`,
                  fontSize: '0.9rem',
                  padding: '8px 12px'
                }}
                labelStyle={{
                  fontWeight: 600,
                  marginBottom: '4px',
                  color: theme.palette.text.primary
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.9rem'
                }}
                cursor={{ stroke: alpha(theme.palette.primary.main, 0.3), strokeWidth: 1, strokeDasharray: '5 5' }}
              />
              {yKeys.map((key, index) => (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={3}
                  dot={{ fill: CHART_COLORS[index % CHART_COLORS.length], strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 8, stroke: CHART_COLORS[index % CHART_COLORS.length], strokeWidth: 3, fill: '#ffffff' }}
                />
              ))}
              {/* Peak annotations — one dot+label per series */}
              {peaks.map(({ key, maxVal, maxX, color }) => (
                <ReferenceDot
                  key={`peak-${key}`}
                  x={maxX}
                  y={maxVal}
                  r={8}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{ value: `▲ ${maxVal}`, position: 'top', fontSize: 11, fontWeight: 600, fill: color }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={sortedData} margin={{ top: 10, right: 70, left: 0, bottom: 5 }} style={{ overflow: 'visible' }}>
              <defs>
                {yKeys.map((key, index) => (
                  <linearGradient key={`gradient-${index}`} id={`barGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.6} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid 
                strokeDasharray="1 3" 
                stroke={alpha(theme.palette.divider, 0.2)} 
                strokeWidth={1}
                horizontal={true}
                vertical={false}
              />
              <XAxis 
                dataKey={xKey} 
                stroke={theme.palette.text.secondary}
                fontSize={11}
                fontWeight={500}
                angle={-45}
                textAnchor="end"
                height={65}
                interval={0}
                axisLine={{ stroke: alpha(theme.palette.divider, 0.3), strokeWidth: 1 }}
                tickLine={{ stroke: alpha(theme.palette.divider, 0.3), strokeWidth: 1 }}
                tickFormatter={(value) => {
                  const formatted = formatDateLabel(value);
                  if (typeof formatted === 'string' && formatted.length > 25) {
                    return formatted.substring(0, 22) + '...';
                  }
                  return formatted;
                }}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={11}
                fontWeight={500}
                tickFormatter={(value) => {
                  if (typeof value === 'number') {
                    if (value >= 1000000) {
                      return `${(value / 1000000).toFixed(1)}M`;
                    } else if (value >= 1000) {
                      return `${(value / 1000).toFixed(0)}K`;
                    }
                    return value.toLocaleString();
                  }
                  return value;
                }}
                axisLine={{ stroke: alpha(theme.palette.divider, 0.3), strokeWidth: 1 }}
                tickLine={{ stroke: alpha(theme.palette.divider, 0.3), strokeWidth: 1 }}
                width={70}
              />
              <Tooltip 
                formatter={customTooltipFormatter}
                labelFormatter={formatDateLabel}
                contentStyle={{
                  backgroundColor: alpha(theme.palette.background.paper, 0.95),
                  border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  borderRadius: '12px',
                  boxShadow: theme.palette.mode === 'dark' 
                    ? '0 8px 32px rgba(0, 0, 0, 0.4)' 
                    : '0 8px 32px rgba(0, 0, 0, 0.12)',
                  fontSize: '0.875rem',
                  backdropFilter: 'blur(8px)',
                  padding: '12px 16px'
                }}
                labelStyle={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  marginBottom: '8px',
                  fontSize: '0.9rem'
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.875rem',
                  padding: '2px 0'
                }}
                cursor={false}
              />
              {yKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`url(#barGradient-${index})`}
                  radius={[6, 6, 0, 0]}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={1}
                  strokeOpacity={0.8}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={sortedData} margin={{ top: 20, right: 70, left: 0, bottom: 5 }} style={{ overflow: 'visible' }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.3)} />
              <XAxis
                dataKey={xKey}
                stroke={theme.palette.text.secondary}
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={55}
                tickFormatter={formatDateLabel}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={12}
                tickFormatter={(value) => typeof value === 'number' ? value.toLocaleString() : value}
              />
              <Tooltip 
                formatter={customTooltipFormatter}
                labelFormatter={formatDateLabel}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: '0.9rem'
                }}
                labelStyle={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  marginBottom: '4px'
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.9rem'
                }}
              />
              {yKeys.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  fill={alpha(CHART_COLORS[index % CHART_COLORS.length], 0.6)}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'circle':
      case 'pie':
        // Transform data for pie chart
        const pieData = yKeys.length > 0 ? sortedData.map((item, index) => ({
          name: item[xKey] || `Item ${index + 1}`,
          value: item[yKeys[0]] || 0
        })) : [];

        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => {
                  const { name, percent } = props;
                  return `${name}: ${(percent * 100).toFixed(1)}%`;
                }}
                outerRadius={Math.min(height * 0.3, 120)}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : value, 'Value']}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: '0.9rem'
                }}
                labelStyle={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  marginBottom: '4px'
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.9rem'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'point':
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart data={sortedData} margin={{ top: 20, right: 70, left: 0, bottom: 5 }} style={{ overflow: 'visible' }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.3)} />
              <XAxis
                dataKey={xKey}
                stroke={theme.palette.text.secondary}
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={55}
                tickFormatter={formatDateLabel}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={12}
                tickFormatter={(value) => typeof value === 'number' ? value.toLocaleString() : value}
              />
              <Tooltip 
                formatter={customTooltipFormatter}
                labelFormatter={formatDateLabel}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: '0.9rem'
                }}
                labelStyle={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  marginBottom: '4px'
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.9rem'
                }}
              />
              {yKeys.map((key, index) => (
                <Scatter
                  key={key}
                  dataKey={key}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        // Default to bar chart for unknown types
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={sortedData} margin={{ top: 20, right: 70, left: 0, bottom: 5 }} style={{ overflow: 'visible' }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.3)} />
              <XAxis
                dataKey={xKey}
                stroke={theme.palette.text.secondary}
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={55}
                tickFormatter={formatDateLabel}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={12}
                tickFormatter={(value) => typeof value === 'number' ? value.toLocaleString() : value}
              />
              <Tooltip 
                formatter={customTooltipFormatter}
                labelFormatter={formatDateLabel}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: '0.9rem'
                }}
                labelStyle={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  marginBottom: '4px'
                }}
                itemStyle={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.9rem'
                }}
              />
              {yKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  // Grouped bar chart for Compare tab (one bar group per X value, one bar per series)
  const renderCompareChart = () => {
    const { xKey, yKeys } = chartConfig;
    if (!sortedData || sortedData.length === 0) return null;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={sortedData} margin={{ top: 20, right: 70, left: 0, bottom: 5 }} barCategoryGap="20%" barGap={3} style={{ overflow: 'visible' }}>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.3)} horizontal vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke={theme.palette.text.secondary}
            fontSize={12}
            tickFormatter={formatDateLabel}
          />
          <YAxis
            stroke={theme.palette.text.secondary}
            fontSize={11}
            width={70}
            tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
          />
          <Tooltip
            formatter={customTooltipFormatter}
            labelFormatter={formatDateLabel}
            contentStyle={{
              backgroundColor: alpha(theme.palette.background.paper, 0.95),
              border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
              borderRadius: '8px',
              fontSize: '0.875rem',
            }}
            labelStyle={{ fontWeight: 600, color: theme.palette.text.primary }}
          />
          {yKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Key insights panel — shown below Trend chart for multi-series data
  const renderInsights = () => {
    if (!insights || !isMultiSeries) return null;
    const { xKey } = chartConfig;
    const cards = [
      {
        label: 'Highest engagement',
        value: insights.highestVal.toLocaleString(),
        sub: `${insights.highestKey}, ${xKey === 'name' || typeof sortedData[0]?.[xKey] === 'number' ? `Hour ${insights.highestX}` : insights.highestX}`,
        color: CHART_COLORS[0],
      },
      {
        label: 'Fastest hourly growth',
        value: `+${insights.fastestGrowth}`,
        sub: `${insights.fastestKey}: ${insights.fastestFromX}→${insights.fastestToX}`,
        color: CHART_COLORS[1],
      },
      {
        label: 'Most consistent',
        value: insights.consistentKey,
        sub: `Range: ${insights.smallestRange} users`,
        color: CHART_COLORS[2],
      },
    ];
    return (
      <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
        {cards.map((card) => (
          <Box
            key={card.label}
            sx={{
              flex: '1 1 140px',
              p: 1.5,
              borderRadius: '8px',
              border: `1px solid ${alpha(card.color, 0.25)}`,
              bgcolor: alpha(card.color, 0.06),
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {card.label}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: card.color, lineHeight: 1.2 }}>
              {card.value}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
              {card.sub}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  // Render data table
  const renderTable = () => {
    if (!originalData || originalData.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body1">No data available</Typography>
        </Box>
      );
    }

    const { xKey, yKeys } = chartConfig;
    // For multi-series pivoted data use sortedData (wide format) + a delta column
    const useWide = isMultiSeries && sortedData && sortedData.length > 0 && yKeys.length >= 2;
    const columns = useWide
      ? [xKey, ...yKeys]
      : Object.keys(originalData[0] || {}).filter(key => key !== 'id');

    const firstY = useWide ? yKeys[0] : null;
    const lastY  = useWide && yKeys.length > 1 ? yKeys[yKeys.length - 1] : null;
    const tableRows = useWide ? sortedData : originalData;

    return (
      <TableContainer sx={{ maxHeight: height - 100 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell key={col} sx={{ fontWeight: 600, backgroundColor: theme.palette.background.default, fontSize: '0.85rem' }}>
                  {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </TableCell>
              ))}
              {useWide && firstY && lastY && (
                <TableCell sx={{ fontWeight: 600, backgroundColor: theme.palette.background.default, fontSize: '0.85rem', color: CHART_COLORS[2] }}>
                  Δ {lastY} vs {firstY}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {tableRows.map((row, index) => (
              <TableRow key={(row as any).id || index} hover>
                {columns.map((col) => (
                  <TableCell key={col} sx={{ fontSize: '0.85rem' }}>
                    {typeof row[col] === 'number' ? row[col].toLocaleString() : row[col]?.toString() || '-'}
                  </TableCell>
                ))}
                {useWide && firstY && lastY && (
                  <TableCell sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {(() => {
                      const delta = (row[lastY] as number) - (row[firstY] as number);
                      const color = delta > 0 ? '#059669' : delta < 0 ? '#DC2626' : 'text.secondary';
                      return <Typography component="span" sx={{ fontSize: '0.85rem', fontWeight: 600, color }}>{delta > 0 ? `+${delta}` : delta}</Typography>;
                    })()}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Paper
      elevation={2}
      sx={{
        borderRadius: 2,
        overflow: 'visible',
        border: `1px solid ${alpha(theme.palette.divider, 0.2)}`
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, textAlign: 'center', flex: 1 }}>
            {title || 'Data Visualization'}
          </Typography>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          centered
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {tabs.map((label) => <Tab key={label} label={label} />)}
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ px: 2, pt: 2, pb: 4, overflow: 'visible' }}>
        {/* Tab 0: Trend / Chart */}
        {activeTab === 0 && (
          <>
            {renderLegendItems()}
            {renderChart()}
            {renderInsights()}
          </>
        )}
        {/* Tab 1: Compare (multi-series) or Table (single-series) */}
        {activeTab === 1 && (
          isMultiSeries ? (
            <>
              {renderLegendItems()}
              {renderCompareChart()}
            </>
          ) : renderTable()
        )}
        {/* Tab 2: Table (multi-series only) */}
        {activeTab === 2 && isMultiSeries && renderTable()}
      </Box>
    </Paper>
  );
};

export default ChartVisualization;
export { ChartVisualization };
