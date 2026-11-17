import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Loader,
  AlertTriangle,
  UserX,
  type LucideIcon
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type {
  AssignedBreakdownRow,
  UnassignedByPlant,
  AssignedChartBarRow
} from '@/types/personalKPIComparison';

export type AssignedBucket =
  | 'closedOnTime'
  | 'closedDelay'
  | 'openNotDue'
  | 'openOverdue'
  | 'unassigned'
  | 'assigned';

export interface AssignedTicketStackedChartProps {
  rows: AssignedBreakdownRow[];
  unassigned: UnassignedByPlant[];
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  /** Selected assignee personnos; when a subset, tile deep-links include assigned_to */
  selectedUserIds?: number[];
  totalUserCount?: number;
}

const COLORS = {
  closedOnTime: '#166534',
  closedDelay: '#84CC16',
  openNotDue: '#FACC15',
  openOverdue: '#DC2626',
  unassigned: '#9CA3AF'
} as const;

const STATE_ICONS: Record<Exclude<AssignedBucket, 'assigned'>, LucideIcon> = {
  closedOnTime: CheckCircle2,
  closedDelay: Clock,
  openNotDue: Loader,
  openOverdue: AlertTriangle,
  unassigned: UserX
};

const STATE_BUCKETS: Array<Exclude<AssignedBucket, 'assigned'>> = [
  'closedOnTime',
  'closedDelay',
  'openNotDue',
  'openOverdue',
  'unassigned'
];

const TARGET_RATIO = 0.9;
const ROW_HEIGHT = 44;
const MAX_BAR_SIZE = 28;
const X_AXIS_HEIGHT = 30;
const CHART_MARGIN = { top: 8, right: 24, left: 8, bottom: 8 };
const Y_AXIS_WIDTH = 220;

type StateTotals = {
  closedOnTime: number;
  closedDelay: number;
  openNotDue: number;
  openOverdue: number;
  unassigned: number;
};

function emptyTotals(): StateTotals {
  return {
    closedOnTime: 0,
    closedDelay: 0,
    openNotDue: 0,
    openOverdue: 0,
    unassigned: 0
  };
}

function totalsSum(totals: StateTotals): number {
  return (
    totals.closedOnTime +
    totals.closedDelay +
    totals.openNotDue +
    totals.openOverdue +
    totals.unassigned
  );
}

/** Share of a bucket, shown after the count as `(12.5%)`. */
function formatShare(value: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (value / total) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

function rowTotal(row: Pick<AssignedChartBarRow, 'closedOnTime' | 'closedDelay' | 'openNotDue' | 'openOverdue' | 'unassigned'>): number {
  return row.closedOnTime + row.closedDelay + row.openNotDue + row.openOverdue + row.unassigned;
}

function buildUserBar(
  personno: number,
  personName: string,
  avatarUrl: string,
  initials: string,
  bgColor: string,
  closedOnTime: number,
  closedDelay: number,
  openNotDue: number,
  openOverdue: number,
  keySuffix = '',
  plant: string | null = null
): AssignedChartBarRow {
  const base = {
    key: `user-${personno}${keySuffix}`,
    personno,
    personName,
    avatarUrl,
    initials,
    bgColor,
    plant,
    closedOnTime,
    closedDelay,
    openNotDue,
    openOverdue,
    unassigned: 0,
    isUnassigned: false
  };
  return { ...base, total: rowTotal(base) };
}

function buildUnassignedBar(
  count: number,
  keySuffix = '',
  plant: string | null = null
): AssignedChartBarRow {
  const base = {
    key: `unassigned${keySuffix}`,
    personno: null,
    personName: '',
    avatarUrl: '',
    initials: '?',
    bgColor: COLORS.unassigned,
    plant,
    closedOnTime: 0,
    closedDelay: 0,
    openNotDue: 0,
    openOverdue: 0,
    unassigned: count,
    isUnassigned: true
  };
  return { ...base, total: rowTotal(base) };
}

function aggregateAll(
  rows: AssignedBreakdownRow[],
  unassigned: UnassignedByPlant[],
  unassignedLabel: string
): AssignedChartBarRow[] {
  const byPerson = new Map<number, AssignedChartBarRow>();

  for (const row of rows) {
    const existing = byPerson.get(row.personno);
    if (existing) {
      existing.closedOnTime += row.closedOnTime;
      existing.closedDelay += row.closedDelay;
      existing.openNotDue += row.openNotDue;
      existing.openOverdue += row.openOverdue;
      existing.total = rowTotal(existing);
    } else {
      byPerson.set(
        row.personno,
        buildUserBar(
          row.personno,
          row.personName,
          row.avatarUrl,
          row.initials,
          row.bgColor,
          row.closedOnTime,
          row.closedDelay,
          row.openNotDue,
          row.openOverdue
        )
      );
    }
  }

  const userBars = Array.from(byPerson.values()).sort((a, b) => b.total - a.total);
  const unassignedTotal = unassigned.reduce((sum, item) => sum + item.count, 0);
  const unassignedBar = buildUnassignedBar(unassignedTotal);
  unassignedBar.personName = unassignedLabel;

  return [...userBars, unassignedBar];
}

function groupByPlant(
  rows: AssignedBreakdownRow[],
  unassigned: UnassignedByPlant[],
  unassignedLabel: string
): { plant: string; bars: AssignedChartBarRow[]; totals: StateTotals }[] {
  const plantSet = new Set<string>();
  rows.forEach((r) => plantSet.add(r.plant || 'Unknown'));
  unassigned.forEach((u) => plantSet.add(u.plant || 'Unknown'));

  const plants = Array.from(plantSet).sort((a, b) => a.localeCompare(b));

  return plants.map((plant) => {
    const plantRows = rows.filter((r) => (r.plant || 'Unknown') === plant);
    const userBars = plantRows
      .map((row) =>
        buildUserBar(
          row.personno,
          row.personName,
          row.avatarUrl,
          row.initials,
          row.bgColor,
          row.closedOnTime,
          row.closedDelay,
          row.openNotDue,
          row.openOverdue,
          `-${plant}`,
          plant
        )
      )
      .sort((a, b) => b.total - a.total);

    const unassignedCount =
      unassigned.find((u) => (u.plant || 'Unknown') === plant)?.count ?? 0;
    const unassignedBar = buildUnassignedBar(unassignedCount, `-${plant}`, plant);
    unassignedBar.personName = unassignedLabel;

    const totals = emptyTotals();
    for (const row of plantRows) {
      totals.closedOnTime += row.closedOnTime;
      totals.closedDelay += row.closedDelay;
      totals.openNotDue += row.openNotDue;
      totals.openOverdue += row.openOverdue;
    }
    totals.unassigned = unassignedCount;

    return {
      plant,
      bars: [...userBars, unassignedBar],
      totals
    };
  }).filter((group) => group.bars.some((b) => b.total > 0));
}

interface CustomYTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  dataByKey: Map<string, AssignedChartBarRow>;
  onRowClick?: (row: AssignedChartBarRow) => void;
}

const CustomYTick: React.FC<CustomYTickProps> = ({
  x = 0,
  y = 0,
  payload,
  dataByKey,
  onRowClick
}) => {
  if (!payload) return null;
  const row = dataByKey.get(payload.value);
  if (!row) return null;

  const avatarSize = 28;
  const left = x - Y_AXIS_WIDTH + 8;

  return (
    <g
      transform={`translate(${left},${y})`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onRowClick?.(row);
      }}
    >
      <defs>
        <clipPath id={`avatar-clip-${row.key}`}>
          <circle cx={avatarSize / 2} cy={0} r={avatarSize / 2} />
        </clipPath>
      </defs>
      {row.avatarUrl ? (
        <image
          href={row.avatarUrl}
          x={0}
          y={-avatarSize / 2}
          width={avatarSize}
          height={avatarSize}
          clipPath={`url(#avatar-clip-${row.key})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle cx={avatarSize / 2} cy={0} r={avatarSize / 2} fill={row.bgColor} />
          <text
            x={avatarSize / 2}
            y={4}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={11}
            fontWeight={600}
          >
            {row.initials}
          </text>
        </>
      )}
      <text
        x={avatarSize + 10}
        y={-4}
        fill="hsl(var(--foreground))"
        fontSize={12}
        fontWeight={500}
      >
        {row.personName.length > 18 ? `${row.personName.slice(0, 16)}…` : row.personName}
      </text>
      <text
        x={avatarSize + 10}
        y={12}
        fill="hsl(var(--muted-foreground))"
        fontSize={11}
      >
        {row.total}
      </text>
    </g>
  );
};

interface StackTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
  dataByKey: Map<string, AssignedChartBarRow>;
  labels: Record<string, string>;
}

const StackTooltip: React.FC<StackTooltipProps> = ({
  active,
  payload,
  label,
  dataByKey,
  labels
}) => {
  if (!active || !payload?.length || !label) return null;
  const row = dataByKey.get(label);
  if (!row) return null;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg">
      <p className="mb-2 text-sm font-medium">{row.personName}</p>
      <div className="space-y-1 text-xs">
        {payload
          .filter((entry) => entry.value > 0)
          .map((entry) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
                {labels[entry.dataKey] || entry.name}
              </span>
              <span className="whitespace-nowrap font-medium">
                {entry.value}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatShare(entry.value, row.total)})
                </span>
              </span>
            </div>
          ))}
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
          <span>{labels.total}</span>
          <span>{row.total}</span>
        </div>
        <p className="pt-1 text-[10px] text-muted-foreground">{labels.clickHint}</p>
      </div>
    </div>
  );
};

interface StateTilesProps {
  totals: StateTotals;
  labels: Record<string, string>;
  plant?: string;
  onTileClick: (bucket: Exclude<AssignedBucket, 'assigned'>, plant?: string) => void;
}

const StateTiles: React.FC<StateTilesProps> = ({ totals, labels, plant, onTileClick }) => {
  const grandTotal = totalsSum(totals);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {STATE_BUCKETS.map((key) => {
        const Icon = STATE_ICONS[key];
        return (
          <Card
            key={`${plant ?? 'all'}-${key}`}
            role="button"
            tabIndex={0}
            className="cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onTileClick(key, plant)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTileClick(key, plant);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-muted-foreground">
                    {labels[key]}
                  </p>
                  <p className="text-2xl font-bold">{totals[key]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShare(totals[key], grandTotal)}
                  </p>
                </div>
                <Icon
                  className="h-5 w-5 shrink-0"
                  style={{ color: COLORS[key] }}
                  aria-hidden
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

interface DepartmentChartRow {
  key: string;
  label: string;
  deptName: string;
  closedOnTime: number;
  closedDelay: number;
  openNotDue: number;
  openOverdue: number;
  unassigned: number;
  total: number;
  target: number;
}

function aggregateByDepartment(
  rows: AssignedBreakdownRow[],
  unknownLabel: string
): DepartmentChartRow[] {
  const byDept = new Map<string, DepartmentChartRow>();

  for (const row of rows) {
    const key = row.deptNo != null ? String(row.deptNo) : 'unknown';
    let entry = byDept.get(key);
    if (!entry) {
      const code = row.deptCode?.trim();
      const name = row.deptName?.trim();
      const fullName = name || code || unknownLabel;
      const axisLabel = code || fullName;
      entry = {
        key,
        label: axisLabel.length > 14 ? `${axisLabel.slice(0, 12)}…` : axisLabel,
        deptName: fullName,
        closedOnTime: 0,
        closedDelay: 0,
        openNotDue: 0,
        openOverdue: 0,
        unassigned: 0,
        total: 0,
        target: 0
      };
      byDept.set(key, entry);
    }
    entry.closedOnTime += row.closedOnTime;
    entry.closedDelay += row.closedDelay;
    entry.openNotDue += row.openNotDue;
    entry.openOverdue += row.openOverdue;
  }

  return Array.from(byDept.values())
    .map((entry) => {
      const total =
        entry.closedOnTime +
        entry.closedDelay +
        entry.openNotDue +
        entry.openOverdue +
        entry.unassigned;
      return { ...entry, total, target: total * TARGET_RATIO };
    })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

interface TargetMarkProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  index?: number;
  bucket: (typeof STATE_BUCKETS)[number];
  rows: DepartmentChartRow[];
}

/** Horizontal mark at 90% of the department stack, drawn once from the top segment. */
const TargetMark: React.FC<TargetMarkProps> = ({ viewBox, index, bucket, rows }) => {
  if (!viewBox || index == null) return null;
  const row = rows[index];
  if (!row || row.total <= 0) return null;

  const topBucket = [...STATE_BUCKETS].reverse().find((key) => row[key] > 0);
  if (topBucket !== bucket) return null;

  const { x = 0, y = 0, width = 0, height = 0 } = viewBox;
  const segmentValue = row[bucket];
  if (segmentValue <= 0 || height <= 0 || width <= 0) return null;

  const pixelsPerUnit = height / segmentValue;
  const yTarget = y + pixelsPerUnit * row.total * (1 - TARGET_RATIO);
  const overhang = 6;
  const x1 = x - overhang;
  const x2 = x + width + overhang;

  return (
    <g>
      <line
        x1={x1}
        x2={x2}
        y1={yTarget}
        y2={yTarget}
        stroke="#ffffff"
        strokeWidth={4}
        strokeDasharray="6 4"
      />
      <line
        x1={x1}
        x2={x2}
        y1={yTarget}
        y2={yTarget}
        stroke="#111827"
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
    </g>
  );
};

interface DepartmentTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | Array<number | string>;
    color?: string;
    fill?: string;
    dataKey?: string | number;
    payload?: DepartmentChartRow;
  }>;
  labels: Record<string, string>;
  targetLabel: string;
}

const DepartmentTooltip: React.FC<DepartmentTooltipProps> = ({
  active,
  payload,
  labels,
  targetLabel
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg">
      <p className="mb-2 text-sm font-medium">{row.deptName}</p>
      <div className="space-y-1 text-xs">
        {STATE_BUCKETS.filter((key) => row[key] > 0).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: COLORS[key] }}
              />
              {labels[key]}
            </span>
            <span className="whitespace-nowrap font-medium">
              {row[key]}{' '}
              <span className="font-normal text-muted-foreground">
                ({formatShare(row[key], row.total)})
              </span>
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
          <span>{labels.total}</span>
          <span>{row.total}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{targetLabel}</span>
          <span>{formatCount(row.target)}</span>
        </div>
      </div>
    </div>
  );
};

interface DepartmentStackedChartProps {
  rows: AssignedBreakdownRow[];
  labels: Record<string, string>;
  unknownLabel: string;
  title: string;
  targetLabel: string;
}

const DepartmentStackedChart: React.FC<DepartmentStackedChartProps> = ({
  rows,
  labels,
  unknownLabel,
  title,
  targetLabel
}) => {
  const data = useMemo(
    () => aggregateByDepartment(rows, unknownLabel),
    [rows, unknownLabel]
  );

  if (data.length === 0) return null;

  const tiltLabels = data.some((row) => row.label.length > 6);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg width="28" height="8" aria-hidden className="shrink-0 text-foreground">
            <line
              x1="1"
              y1="4"
              x2="27"
              y2="4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
          </svg>
          {targetLabel}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 12, right: 16, left: 8, bottom: tiltLabels ? 24 : 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            fontSize={12}
            angle={tiltLabels ? -35 : 0}
            textAnchor={tiltLabels ? 'end' : 'middle'}
            height={tiltLabels ? 70 : 30}
          />
          <YAxis allowDecimals={false} fontSize={12} width={40} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            content={<DepartmentTooltip labels={labels} targetLabel={targetLabel} />}
          />
          {STATE_BUCKETS.map((bucket) => (
            <Bar
              key={bucket}
              dataKey={bucket}
              stackId="dept"
              fill={COLORS[bucket]}
              name={bucket}
              isAnimationActive={false}
              maxBarSize={56}
            >
              <LabelList
                dataKey={bucket}
                content={(props) => (
                  <TargetMark
                    viewBox={(props as TargetMarkProps).viewBox}
                    index={(props as TargetMarkProps).index}
                    bucket={bucket}
                    rows={data}
                  />
                )}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const StateLegend: React.FC<{ labels: Record<string, string> }> = ({ labels }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
    {STATE_BUCKETS.map((bucket) => (
      <span key={bucket} className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: COLORS[bucket] }}
        />
        {labels[bucket]}
      </span>
    ))}
  </div>
);

interface SingleChartProps {
  bars: AssignedChartBarRow[];
  labels: Record<string, string>;
  title?: string;
  xMax?: number;
  onSegmentClick: (row: AssignedChartBarRow, bucket: AssignedBucket) => void;
  onRowClick: (row: AssignedChartBarRow) => void;
}

const SingleStackedChart: React.FC<SingleChartProps> = ({
  bars,
  labels,
  title,
  xMax,
  onSegmentClick,
  onRowClick
}) => {
  const dataByKey = useMemo(() => new Map(bars.map((b) => [b.key, b])), [bars]);
  const height =
    bars.length * ROW_HEIGHT + X_AXIS_HEIGHT + CHART_MARGIN.top + CHART_MARGIN.bottom;

  const chartData = bars.map((b) => ({
    ...b,
    name: b.key
  }));

  const handleBarClick = (data: AssignedChartBarRow, bucket: AssignedBucket) => {
    if (!data) return;
    const value = data[bucket];
    if (!value || value <= 0) return;
    onSegmentClick(data, bucket);
  };

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={CHART_MARGIN}
          barCategoryGap={8}
          maxBarSize={MAX_BAR_SIZE}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            height={X_AXIS_HEIGHT}
            allowDecimals={false}
            domain={xMax != null && xMax > 0 ? [0, xMax] : [0, 'auto']}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={Y_AXIS_WIDTH}
            tick={<CustomYTick dataByKey={dataByKey} onRowClick={onRowClick} />}
            interval={0}
          />
          <Tooltip
            content={
              <StackTooltip
                dataByKey={dataByKey}
                labels={labels}
              />
            }
          />
          {STATE_BUCKETS.map((bucket) => (
            <Bar
              key={bucket}
              dataKey={bucket}
              stackId="a"
              fill={COLORS[bucket]}
              name={bucket}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(data) => {
                const row = ((data as { payload?: AssignedChartBarRow })?.payload
                  ?? data) as AssignedChartBarRow;
                handleBarClick(row, bucket);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const AssignedTicketStackedChart: React.FC<AssignedTicketStackedChartProps> = ({
  rows,
  unassigned,
  loading,
  error,
  startDate,
  endDate,
  selectedUserIds = [],
  totalUserCount = 0
}) => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'all' | 'byPlant'>('all');

  const labels = useMemo(
    () => ({
      closedOnTime: t('dashboard.personalKPIComparison.closedOnTime'),
      closedDelay: t('dashboard.personalKPIComparison.closedDelay'),
      openNotDue: t('dashboard.personalKPIComparison.openNotDue'),
      openOverdue: t('dashboard.personalKPIComparison.openOverdue'),
      unassigned: t('dashboard.personalKPIComparison.unassigned'),
      total: t('dashboard.personalKPIComparison.total'),
      clickHint: t('dashboard.personalKPIComparison.clickToViewTickets')
    }),
    [t]
  );

  const unassignedLabel = t('dashboard.personalKPIComparison.unassigned');
  const unknownPlantLabel = t('dashboard.personalKPIComparison.unknownPlant');
  const unknownDepartmentLabel = t('dashboard.personalKPIComparison.unknownDepartment');
  const departmentChart = (
    <DepartmentStackedChart
      rows={rows}
      labels={labels}
      unknownLabel={unknownDepartmentLabel}
      title={t('dashboard.personalKPIComparison.byDepartment')}
      targetLabel={t('dashboard.personalKPIComparison.target90')}
    />
  );

  const allBars = useMemo(
    () => aggregateAll(rows, unassigned, unassignedLabel),
    [rows, unassigned, unassignedLabel]
  );

  const allTotals = useMemo(() => {
    const totals = emptyTotals();
    for (const row of rows) {
      totals.closedOnTime += row.closedOnTime;
      totals.closedDelay += row.closedDelay;
      totals.openNotDue += row.openNotDue;
      totals.openOverdue += row.openOverdue;
    }
    totals.unassigned = unassigned.reduce((sum, item) => sum + item.count, 0);
    return totals;
  }, [rows, unassigned]);

  const plantGroups = useMemo(
    () => groupByPlant(rows, unassigned, unassignedLabel),
    [rows, unassigned, unassignedLabel]
  );

  const plantXMax = useMemo(() => {
    let max = 0;
    for (const group of plantGroups) {
      for (const bar of group.bars) {
        if (bar.total > max) max = bar.total;
      }
    }
    return max;
  }, [plantGroups]);

  const openBucketTickets = (
    bucket: Exclude<AssignedBucket, 'assigned'>,
    plant?: string
  ) => {
    const params = new URLSearchParams();
    params.set('assignedBucket', bucket);

    if (bucket === 'unassigned') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    } else {
      params.set('dueStartDate', startDate);
      params.set('dueEndDate', endDate);
      if (
        selectedUserIds.length > 0 &&
        totalUserCount > 0 &&
        selectedUserIds.length < totalUserCount
      ) {
        params.set('assigned_to', selectedUserIds.join(','));
      }
    }

    if (plant) {
      params.set('plant', plant === unknownPlantLabel ? 'Unknown' : plant);
    }

    window.open(`/tickets?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const navigateToTickets = (row: AssignedChartBarRow, bucket: AssignedBucket) => {
    const params = new URLSearchParams();
    params.set('assignedBucket', bucket);

    if (bucket === 'unassigned') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    } else {
      params.set('dueStartDate', startDate);
      params.set('dueEndDate', endDate);
      if (row.personno != null) {
        params.set('assigned_to', String(row.personno));
      }
    }

    if (row.plant) {
      params.set('plant', row.plant === unknownPlantLabel ? 'Unknown' : row.plant);
    }

    window.open(`/tickets?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleSegmentClick = (row: AssignedChartBarRow, bucket: AssignedBucket) => {
    navigateToTickets(row, bucket);
  };

  const handleRowClick = (row: AssignedChartBarRow) => {
    if (row.isUnassigned) {
      navigateToTickets(row, 'unassigned');
    } else {
      navigateToTickets(row, 'assigned');
    }
  };

  const plantNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of [...rows, ...unassigned]) {
      if (item.plantName && !names.has(item.plant)) names.set(item.plant, item.plantName);
    }
    return names;
  }, [rows, unassigned]);

  const plantDisplayName = (plant: string) => {
    if (plant === 'Unknown') return unknownPlantLabel;
    const name = plantNames.get(plant);
    return name ? `${name} (${plant})` : plant;
  };

  const kpiTitle = t('dashboard.personalKPIComparison.ticketCountAssigned');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>{kpiTitle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>{kpiTitle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-sm text-destructive">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData =
    rows.some(
      (r) => r.closedOnTime + r.closedDelay + r.openNotDue + r.openOverdue > 0
    ) || unassigned.some((u) => u.count > 0);

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>{kpiTitle}</span>
          </div>
          <div className="flex space-x-1 rounded-lg bg-muted p-1">
            <Button
              type="button"
              variant={viewMode === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('all')}
              className={cn('flex-1 sm:flex-none')}
            >
              {t('dashboard.personalKPIComparison.all')}
            </Button>
            <Button
              type="button"
              variant={viewMode === 'byPlant' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('byPlant')}
              className={cn('flex-1 sm:flex-none')}
            >
              {t('dashboard.personalKPIComparison.byPlant')}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!hasData ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            {t('dashboard.personalKPIComparison.noDataDescription')}
          </div>
        ) : viewMode === 'all' ? (
          <div className="space-y-4">
            {departmentChart}
            <StateTiles
              totals={allTotals}
              labels={labels}
              onTileClick={openBucketTickets}
            />
            <StateLegend labels={labels} />
            <SingleStackedChart
              bars={allBars}
              labels={labels}
              onSegmentClick={handleSegmentClick}
              onRowClick={handleRowClick}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {departmentChart}
            <StateLegend labels={labels} />
            {plantGroups.map((group) => (
              <div key={group.plant} className="space-y-3">
                <h3 className="text-base font-semibold text-foreground">
                  {plantDisplayName(group.plant)}
                </h3>
                <StateTiles
                  totals={group.totals}
                  labels={labels}
                  plant={group.plant}
                  onTileClick={openBucketTickets}
                />
                <SingleStackedChart
                  bars={group.bars}
                  labels={labels}
                  xMax={plantXMax}
                  onSegmentClick={handleSegmentClick}
                  onRowClick={handleRowClick}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AssignedTicketStackedChart;
