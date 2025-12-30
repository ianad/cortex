import type { SemanticFilter } from './output-formats'

// ============================================================================
// Filter Operator and Value Types
// ============================================================================

/**
 * All supported filter operators for dashboard filtering
 */
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_equals'
  | 'less_than'
  | 'less_than_equals'
  | 'in'
  | 'not_in'
  | 'like'
  | 'not_like'
  | 'is_null'
  | 'is_not_null'
  | 'between'
  | 'not_between'

/**
 * Value type hints for filter values
 */
export type FilterValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'array'

// ============================================================================
// Core Filter Types
// ============================================================================

/**
 * A single filter applied by the user
 */
export interface FilterValue {
  /** Unique identifier for this filter */
  id: string
  /** Column/field being filtered */
  dimension: string
  /** Optional table name */
  table?: string
  /** Filter operator (equals, in, between, etc.) */
  operator: FilterOperator
  /** Single value for simple operators */
  value?: any
  /** Multiple values for IN/NOT_IN operators */
  values?: any[]
  /** Minimum value for BETWEEN operator */
  minValue?: any
  /** Maximum value for BETWEEN operator */
  maxValue?: any
  /** Type hint for the filter value */
  valueType?: FilterValueType
  /** Whether this filter is currently active */
  isActive: boolean
  /** Human-readable label for display */
  label?: string
}

/**
 * Widget-specific filter overrides
 */
export interface WidgetFilterOverride {
  /** Alias of the widget these overrides apply to */
  widgetAlias: string
  /** Filters specific to this widget */
  filters: FilterValue[]
  /** If true, this widget ignores global dashboard filters */
  ignoreGlobalFilters?: boolean
}

// ============================================================================
// Filter History Types
// ============================================================================

/**
 * Entry in the filter history for undo/redo functionality
 */
export interface FilterHistoryEntry {
  /** Timestamp when this state was recorded */
  timestamp: number
  /** Global filters at this point in history */
  globalFilters: FilterValue[]
  /** Widget overrides at this point in history */
  widgetOverrides: Map<string, WidgetFilterOverride>
  /** Human-readable description of this change */
  description: string
}

// ============================================================================
// Dashboard Filter Context
// ============================================================================

/**
 * Dashboard-level filter context containing all filter state
 */
export interface DashboardFilterContext {
  /** ID of the dashboard */
  dashboardId: string
  /** Alias of the current view */
  viewAlias: string
  /** Global filters applied to all widgets (unless overridden) */
  globalFilters: FilterValue[]
  /** Widget-specific filter overrides, keyed by widget alias */
  widgetOverrides: Map<string, WidgetFilterOverride>
  /** Whether cross-filtering between widgets is enabled */
  crossFilteringEnabled: boolean
  /** History of filter states for undo/redo */
  filterHistory: FilterHistoryEntry[]
  /** Current position in the filter history (-1 or length means at latest) */
  historyIndex: number
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts a FilterValue to the API's SemanticFilter format
 */
export function filterValueToSemanticFilter(filter: FilterValue): SemanticFilter {
  return {
    name: filter.dimension,
    query: filter.dimension,
    table: filter.table,
    operator: filter.operator,
    value: filter.value,
    values: filter.values,
    min_value: filter.minValue,
    max_value: filter.maxValue,
    value_type: filter.valueType,
    is_active: filter.isActive
  }
}

/**
 * Generates a unique filter ID
 */
export function generateFilterId(): string {
  return `filter_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Creates an empty/default filter with optional dimension preset
 */
export function createEmptyFilter(dimension?: string): FilterValue {
  return {
    id: generateFilterId(),
    dimension: dimension ?? '',
    operator: 'equals',
    isActive: true
  }
}
