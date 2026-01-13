# Slice & Dice Phase 1: Interactive Filter System

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to dynamically filter dashboard widgets without modifying widget configurations.

**Architecture:** Add a filter context system that maintains global and widget-level filters. When widgets execute, merge runtime filters with existing `MetricExecutionOverrides`. The backend already supports this via `MetricModifiers` - we just need frontend UI and a cleaner API surface.

**Tech Stack:** Vue 3, TypeScript, Pydantic, FastAPI, existing SemanticFilter/MetricModifiers infrastructure

**GitHub Issue:** https://github.com/TelescopeAI/cortex/issues/6

---

## Task 1: Create Dashboard Filter Context Types

**Files:**
- Create: `frontend/cortex/app/types/filter-context.ts`

**Step 1: Create the filter context type definitions**

```typescript
// frontend/cortex/app/types/filter-context.ts
import type { SemanticFilter } from './output-formats'

/**
 * Filter value represents a single filter applied by the user
 */
export interface FilterValue {
  /** Unique identifier for this filter instance */
  id: string
  /** Column/field being filtered */
  dimension: string
  /** Table name (optional, for qualified columns) */
  table?: string
  /** Filter operator (equals, in, between, etc.) */
  operator: FilterOperator
  /** Single value for simple operators */
  value?: any
  /** Multiple values for IN/NOT_IN operators */
  values?: any[]
  /** Min value for BETWEEN operator */
  minValue?: any
  /** Max value for BETWEEN operator */
  maxValue?: any
  /** Value type hint */
  valueType?: FilterValueType
  /** Whether this filter is currently active */
  isActive: boolean
  /** Human-readable label for display */
  label?: string
}

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

export type FilterValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'array'

/**
 * Widget-specific filter overrides
 */
export interface WidgetFilterOverride {
  /** Widget alias */
  widgetAlias: string
  /** Filters specific to this widget */
  filters: FilterValue[]
  /** Whether to ignore global filters for this widget */
  ignoreGlobalFilters?: boolean
}

/**
 * Dashboard-level filter context
 * Manages global filters and per-widget overrides
 */
export interface DashboardFilterContext {
  /** Dashboard ID this context belongs to */
  dashboardId: string
  /** View alias this context applies to */
  viewAlias: string
  /** Global filters applied to all widgets */
  globalFilters: FilterValue[]
  /** Widget-specific filter overrides */
  widgetOverrides: Map<string, WidgetFilterOverride>
  /** Whether cross-widget filtering is enabled */
  crossFilteringEnabled: boolean
  /** History of filter states for undo/redo */
  filterHistory: FilterHistoryEntry[]
  /** Current position in history */
  historyIndex: number
}

export interface FilterHistoryEntry {
  timestamp: number
  globalFilters: FilterValue[]
  widgetOverrides: Map<string, WidgetFilterOverride>
  description: string
}

/**
 * Convert FilterValue to SemanticFilter for API requests
 */
export function filterValueToSemanticFilter(filter: FilterValue): SemanticFilter {
  return {
    name: filter.id,
    query: filter.dimension,
    table: filter.table,
    operator: filter.operator,
    value: filter.value,
    values: filter.values,
    min_value: filter.minValue,
    max_value: filter.maxValue,
    value_type: filter.valueType || 'string',
    filter_type: 'where',
    is_active: filter.isActive
  }
}

/**
 * Generate a unique filter ID
 */
export function generateFilterId(): string {
  return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create an empty filter value with defaults
 */
export function createEmptyFilter(dimension?: string): FilterValue {
  return {
    id: generateFilterId(),
    dimension: dimension || '',
    operator: 'equals',
    isActive: true
  }
}
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/types/filter-context.ts
git commit -m "feat(filters): add dashboard filter context types"
```

---

## Task 2: Create Filter Context Composable

**Files:**
- Create: `frontend/cortex/app/composables/useFilterContext.ts`

**Step 1: Create the filter context composable**

```typescript
// frontend/cortex/app/composables/useFilterContext.ts
import { ref, computed, readonly, watch } from 'vue'
import type {
  DashboardFilterContext,
  FilterValue,
  WidgetFilterOverride,
  FilterHistoryEntry
} from '~/types/filter-context'
import {
  generateFilterId,
  createEmptyFilter,
  filterValueToSemanticFilter
} from '~/types/filter-context'

const MAX_HISTORY_SIZE = 50
const STORAGE_KEY_PREFIX = 'cortex_filter_context_'

/**
 * Composable for managing dashboard filter context
 * Provides reactive filter state with undo/redo and persistence
 */
export function useFilterContext(dashboardId: string, viewAlias: string) {
  // State
  const globalFilters = ref<FilterValue[]>([])
  const widgetOverrides = ref<Map<string, WidgetFilterOverride>>(new Map())
  const crossFilteringEnabled = ref(false)
  const filterHistory = ref<FilterHistoryEntry[]>([])
  const historyIndex = ref(-1)
  const isInitialized = ref(false)

  // Computed
  const hasActiveFilters = computed(() => {
    return globalFilters.value.some(f => f.isActive && f.dimension)
  })

  const activeFilterCount = computed(() => {
    return globalFilters.value.filter(f => f.isActive && f.dimension).length
  })

  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < filterHistory.value.length - 1)

  // Storage key for this dashboard/view combination
  const storageKey = computed(() =>
    `${STORAGE_KEY_PREFIX}${dashboardId}_${viewAlias}`
  )

  // Initialize from localStorage
  function initialize() {
    if (isInitialized.value) return

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (stored) {
        const parsed = JSON.parse(stored)
        globalFilters.value = parsed.globalFilters || []
        crossFilteringEnabled.value = parsed.crossFilteringEnabled || false
        // Rebuild Map from stored object
        if (parsed.widgetOverrides) {
          widgetOverrides.value = new Map(Object.entries(parsed.widgetOverrides))
        }
      }
    } catch (e) {
      console.warn('Failed to load filter context from storage:', e)
    }

    // Save initial state to history
    saveToHistory('Initial state')
    isInitialized.value = true
  }

  // Persist to localStorage
  function persist() {
    try {
      const toStore = {
        globalFilters: globalFilters.value,
        crossFilteringEnabled: crossFilteringEnabled.value,
        widgetOverrides: Object.fromEntries(widgetOverrides.value)
      }
      localStorage.setItem(storageKey.value, JSON.stringify(toStore))
    } catch (e) {
      console.warn('Failed to persist filter context:', e)
    }
  }

  // Save current state to history
  function saveToHistory(description: string) {
    // Truncate future history if we're not at the end
    if (historyIndex.value < filterHistory.value.length - 1) {
      filterHistory.value = filterHistory.value.slice(0, historyIndex.value + 1)
    }

    // Add new entry
    filterHistory.value.push({
      timestamp: Date.now(),
      globalFilters: JSON.parse(JSON.stringify(globalFilters.value)),
      widgetOverrides: new Map(widgetOverrides.value),
      description
    })

    // Limit history size
    if (filterHistory.value.length > MAX_HISTORY_SIZE) {
      filterHistory.value = filterHistory.value.slice(-MAX_HISTORY_SIZE)
    }

    historyIndex.value = filterHistory.value.length - 1
  }

  // Filter management
  function addGlobalFilter(filter?: Partial<FilterValue>): FilterValue {
    const newFilter = {
      ...createEmptyFilter(),
      ...filter
    }
    globalFilters.value = [...globalFilters.value, newFilter]
    saveToHistory(`Added filter on ${filter?.dimension || 'new field'}`)
    persist()
    return newFilter
  }

  function updateGlobalFilter(filterId: string, updates: Partial<FilterValue>) {
    const index = globalFilters.value.findIndex(f => f.id === filterId)
    if (index !== -1) {
      globalFilters.value = globalFilters.value.map((f, i) =>
        i === index ? { ...f, ...updates } : f
      )
      saveToHistory(`Updated filter ${filterId}`)
      persist()
    }
  }

  function removeGlobalFilter(filterId: string) {
    const filter = globalFilters.value.find(f => f.id === filterId)
    globalFilters.value = globalFilters.value.filter(f => f.id !== filterId)
    saveToHistory(`Removed filter on ${filter?.dimension || 'field'}`)
    persist()
  }

  function toggleGlobalFilter(filterId: string) {
    const filter = globalFilters.value.find(f => f.id === filterId)
    if (filter) {
      updateGlobalFilter(filterId, { isActive: !filter.isActive })
    }
  }

  function clearAllFilters() {
    globalFilters.value = []
    widgetOverrides.value = new Map()
    saveToHistory('Cleared all filters')
    persist()
  }

  // Widget-specific overrides
  function setWidgetFilters(widgetAlias: string, filters: FilterValue[], ignoreGlobal = false) {
    widgetOverrides.value.set(widgetAlias, {
      widgetAlias,
      filters,
      ignoreGlobalFilters: ignoreGlobal
    })
    widgetOverrides.value = new Map(widgetOverrides.value) // Trigger reactivity
    saveToHistory(`Set filters for widget ${widgetAlias}`)
    persist()
  }

  function clearWidgetFilters(widgetAlias: string) {
    widgetOverrides.value.delete(widgetAlias)
    widgetOverrides.value = new Map(widgetOverrides.value)
    saveToHistory(`Cleared filters for widget ${widgetAlias}`)
    persist()
  }

  // Get effective filters for a widget (global + widget-specific)
  function getEffectiveFilters(widgetAlias: string): FilterValue[] {
    const override = widgetOverrides.value.get(widgetAlias)

    if (override?.ignoreGlobalFilters) {
      return override.filters.filter(f => f.isActive)
    }

    const widgetFilters = override?.filters || []
    const activeGlobal = globalFilters.value.filter(f => f.isActive)

    // Merge: widget filters override global filters by dimension
    const merged = new Map<string, FilterValue>()

    for (const f of activeGlobal) {
      merged.set(f.dimension, f)
    }
    for (const f of widgetFilters) {
      if (f.isActive) {
        merged.set(f.dimension, f)
      }
    }

    return Array.from(merged.values())
  }

  // Convert to API format (SemanticFilter[])
  function getFiltersForApi(widgetAlias: string) {
    const effective = getEffectiveFilters(widgetAlias)
    return effective
      .filter(f => f.dimension) // Must have a dimension set
      .map(filterValueToSemanticFilter)
  }

  // Undo/Redo
  function undo() {
    if (!canUndo.value) return

    historyIndex.value--
    const entry = filterHistory.value[historyIndex.value]
    globalFilters.value = JSON.parse(JSON.stringify(entry.globalFilters))
    widgetOverrides.value = new Map(entry.widgetOverrides)
    persist()
  }

  function redo() {
    if (!canRedo.value) return

    historyIndex.value++
    const entry = filterHistory.value[historyIndex.value]
    globalFilters.value = JSON.parse(JSON.stringify(entry.globalFilters))
    widgetOverrides.value = new Map(entry.widgetOverrides)
    persist()
  }

  // Initialize on first use
  initialize()

  return {
    // State (readonly for external use)
    globalFilters: readonly(globalFilters),
    widgetOverrides: readonly(widgetOverrides),
    crossFilteringEnabled: readonly(crossFilteringEnabled),

    // Computed
    hasActiveFilters,
    activeFilterCount,
    canUndo,
    canRedo,

    // Global filter methods
    addGlobalFilter,
    updateGlobalFilter,
    removeGlobalFilter,
    toggleGlobalFilter,
    clearAllFilters,

    // Widget filter methods
    setWidgetFilters,
    clearWidgetFilters,
    getEffectiveFilters,
    getFiltersForApi,

    // History
    undo,
    redo,

    // Settings
    setCrossFiltering: (enabled: boolean) => {
      crossFilteringEnabled.value = enabled
      persist()
    }
  }
}
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/composables/useFilterContext.ts
git commit -m "feat(filters): add filter context composable with persistence"
```

---

## Task 3: Create FilterChip Component

**Files:**
- Create: `frontend/cortex/app/components/filters/FilterChip.vue`

**Step 1: Create the filter chip component**

```vue
<!-- frontend/cortex/app/components/filters/FilterChip.vue -->
<template>
  <div
    :class="[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm transition-all',
      isActive
        ? 'bg-primary/10 text-primary border border-primary/20'
        : 'bg-muted text-muted-foreground border border-transparent'
    ]"
  >
    <!-- Filter content -->
    <button
      type="button"
      class="flex items-center gap-1.5 hover:opacity-80"
      @click="$emit('click')"
    >
      <Filter class="h-3 w-3" />
      <span class="font-medium">{{ label }}</span>
      <span class="text-xs opacity-75">{{ operatorLabel }}</span>
      <span class="font-medium">{{ displayValue }}</span>
    </button>

    <!-- Toggle active -->
    <button
      type="button"
      class="p-0.5 hover:bg-primary/20 rounded-full transition-colors"
      :title="isActive ? 'Disable filter' : 'Enable filter'"
      @click.stop="$emit('toggle')"
    >
      <component
        :is="isActive ? Eye : EyeOff"
        class="h-3 w-3"
      />
    </button>

    <!-- Remove -->
    <button
      type="button"
      class="p-0.5 hover:bg-destructive/20 hover:text-destructive rounded-full transition-colors"
      title="Remove filter"
      @click.stop="$emit('remove')"
    >
      <X class="h-3 w-3" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Filter, X, Eye, EyeOff } from 'lucide-vue-next'
import type { FilterValue, FilterOperator } from '~/types/filter-context'

interface Props {
  filter: FilterValue
}

const props = defineProps<Props>()

defineEmits<{
  click: []
  toggle: []
  remove: []
}>()

const isActive = computed(() => props.filter.isActive)

const label = computed(() => {
  return props.filter.label || props.filter.dimension || 'Filter'
})

const operatorLabels: Record<FilterOperator, string> = {
  equals: '=',
  not_equals: '≠',
  greater_than: '>',
  greater_than_equals: '≥',
  less_than: '<',
  less_than_equals: '≤',
  in: 'in',
  not_in: 'not in',
  like: 'like',
  not_like: 'not like',
  is_null: 'is null',
  is_not_null: 'is not null',
  between: 'between',
  not_between: 'not between'
}

const operatorLabel = computed(() => {
  return operatorLabels[props.filter.operator] || props.filter.operator
})

const displayValue = computed(() => {
  const { operator, value, values, minValue, maxValue } = props.filter

  if (operator === 'is_null' || operator === 'is_not_null') {
    return ''
  }

  if (operator === 'in' || operator === 'not_in') {
    if (values && values.length > 0) {
      if (values.length <= 2) {
        return `(${values.join(', ')})`
      }
      return `(${values.length} values)`
    }
    return '(...)'
  }

  if (operator === 'between' || operator === 'not_between') {
    return `${minValue ?? '?'} - ${maxValue ?? '?'}`
  }

  if (value !== undefined && value !== null && value !== '') {
    const strValue = String(value)
    return strValue.length > 20 ? strValue.slice(0, 17) + '...' : strValue
  }

  return '?'
})
</script>
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/components/filters/FilterChip.vue
git commit -m "feat(filters): add FilterChip component"
```

---

## Task 4: Create FilterEditor Component

**Files:**
- Create: `frontend/cortex/app/components/filters/FilterEditor.vue`

**Step 1: Create the filter editor component**

```vue
<!-- frontend/cortex/app/components/filters/FilterEditor.vue -->
<template>
  <div class="space-y-4 p-4 border rounded-lg bg-card">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium">
        {{ isNew ? 'Add Filter' : 'Edit Filter' }}
      </h4>
      <Button variant="ghost" size="sm" @click="$emit('cancel')">
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- Column/Dimension Selection -->
    <div class="space-y-2">
      <Label class="text-xs">Column</Label>
      <Select v-model="localFilter.dimension">
        <SelectTrigger>
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="col in availableColumns"
            :key="col.name"
            :value="col.name"
          >
            <div class="flex items-center gap-2">
              <span>{{ col.name }}</span>
              <Badge variant="outline" class="text-[10px]">
                {{ col.type }}
              </Badge>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Operator Selection -->
    <div class="space-y-2">
      <Label class="text-xs">Operator</Label>
      <Select v-model="localFilter.operator">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="equals">Equals</SelectItem>
          <SelectItem value="not_equals">Not equals</SelectItem>
          <SelectItem value="greater_than">Greater than</SelectItem>
          <SelectItem value="greater_than_equals">Greater than or equals</SelectItem>
          <SelectItem value="less_than">Less than</SelectItem>
          <SelectItem value="less_than_equals">Less than or equals</SelectItem>
          <SelectItem value="in">In list</SelectItem>
          <SelectItem value="not_in">Not in list</SelectItem>
          <SelectItem value="like">Contains</SelectItem>
          <SelectItem value="not_like">Does not contain</SelectItem>
          <SelectItem value="is_null">Is empty</SelectItem>
          <SelectItem value="is_not_null">Is not empty</SelectItem>
          <SelectItem value="between">Between</SelectItem>
          <SelectItem value="not_between">Not between</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Value Input (conditional) -->
    <div v-if="showValueInput" class="space-y-2">
      <Label class="text-xs">Value</Label>

      <!-- Single value -->
      <Input
        v-if="isSingleValueOperator"
        v-model="localFilter.value"
        :type="inputType"
        placeholder="Enter value"
      />

      <!-- Multiple values (IN, NOT IN) -->
      <div v-else-if="isMultiValueOperator" class="space-y-2">
        <Input
          v-model="valuesInput"
          placeholder="value1, value2, value3"
        />
        <p class="text-xs text-muted-foreground">
          Separate values with commas
        </p>
      </div>

      <!-- Range values (BETWEEN) -->
      <div v-else-if="isRangeOperator" class="flex items-center gap-2">
        <Input
          v-model="localFilter.minValue"
          :type="inputType"
          placeholder="Min"
          class="flex-1"
        />
        <span class="text-muted-foreground">to</span>
        <Input
          v-model="localFilter.maxValue"
          :type="inputType"
          placeholder="Max"
          class="flex-1"
        />
      </div>
    </div>

    <!-- Label (optional) -->
    <div class="space-y-2">
      <Label class="text-xs">Label (optional)</Label>
      <Input
        v-model="localFilter.label"
        placeholder="Display label for this filter"
      />
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="outline" size="sm" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button
        size="sm"
        :disabled="!isValid"
        @click="handleSave"
      >
        {{ isNew ? 'Add' : 'Update' }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select'
import type { FilterValue, FilterOperator } from '~/types/filter-context'
import { createEmptyFilter } from '~/types/filter-context'

interface ColumnInfo {
  name: string
  type: string
  table?: string
}

interface Props {
  filter?: FilterValue | null
  availableColumns: ColumnInfo[]
}

const props = withDefaults(defineProps<Props>(), {
  filter: null,
  availableColumns: () => []
})

const emit = defineEmits<{
  save: [filter: FilterValue]
  cancel: []
}>()

const isNew = computed(() => !props.filter)

// Local copy of filter for editing
const localFilter = ref<FilterValue>(
  props.filter
    ? { ...props.filter }
    : createEmptyFilter()
)

// Watch for external filter changes
watch(() => props.filter, (newFilter) => {
  if (newFilter) {
    localFilter.value = { ...newFilter }
  } else {
    localFilter.value = createEmptyFilter()
  }
}, { immediate: true })

// Values input for multi-value operators
const valuesInput = computed({
  get: () => localFilter.value.values?.join(', ') || '',
  set: (val: string) => {
    localFilter.value.values = val
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }
})

// Operator type checks
const nullOperators: FilterOperator[] = ['is_null', 'is_not_null']
const multiValueOperators: FilterOperator[] = ['in', 'not_in']
const rangeOperators: FilterOperator[] = ['between', 'not_between']

const showValueInput = computed(() =>
  !nullOperators.includes(localFilter.value.operator)
)

const isSingleValueOperator = computed(() =>
  !nullOperators.includes(localFilter.value.operator) &&
  !multiValueOperators.includes(localFilter.value.operator) &&
  !rangeOperators.includes(localFilter.value.operator)
)

const isMultiValueOperator = computed(() =>
  multiValueOperators.includes(localFilter.value.operator)
)

const isRangeOperator = computed(() =>
  rangeOperators.includes(localFilter.value.operator)
)

// Determine input type based on selected column
const inputType = computed(() => {
  const col = props.availableColumns.find(
    c => c.name === localFilter.value.dimension
  )
  if (!col) return 'text'

  const type = col.type.toUpperCase()
  if (type.includes('INT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('FLOAT')) {
    return 'number'
  }
  if (type.includes('DATE') && !type.includes('TIME')) {
    return 'date'
  }
  return 'text'
})

// Validation
const isValid = computed(() => {
  const f = localFilter.value

  // Must have a dimension
  if (!f.dimension) return false

  // Null operators don't need values
  if (nullOperators.includes(f.operator)) return true

  // Multi-value operators need at least one value
  if (isMultiValueOperator.value) {
    return f.values && f.values.length > 0
  }

  // Range operators need both min and max
  if (isRangeOperator.value) {
    return f.minValue !== undefined && f.minValue !== '' &&
           f.maxValue !== undefined && f.maxValue !== ''
  }

  // Single value operators need a value
  return f.value !== undefined && f.value !== ''
})

function handleSave() {
  if (!isValid.value) return
  emit('save', { ...localFilter.value })
}
</script>
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/components/filters/FilterEditor.vue
git commit -m "feat(filters): add FilterEditor component"
```

---

## Task 5: Create FilterPanel Component

**Files:**
- Create: `frontend/cortex/app/components/filters/FilterPanel.vue`

**Step 1: Create the filter panel component**

```vue
<!-- frontend/cortex/app/components/filters/FilterPanel.vue -->
<template>
  <div class="border-b bg-muted/30">
    <!-- Collapsed View -->
    <div class="flex items-center gap-2 px-4 py-2">
      <!-- Filter icon and count -->
      <Button
        variant="ghost"
        size="sm"
        class="gap-2"
        @click="isExpanded = !isExpanded"
      >
        <Filter class="h-4 w-4" />
        <span>Filters</span>
        <Badge v-if="activeFilterCount > 0" variant="secondary" class="ml-1">
          {{ activeFilterCount }}
        </Badge>
        <ChevronDown
          :class="[
            'h-4 w-4 transition-transform',
            isExpanded && 'rotate-180'
          ]"
        />
      </Button>

      <!-- Active filter chips -->
      <div class="flex-1 flex items-center gap-2 overflow-x-auto">
        <FilterChip
          v-for="filter in activeFilters"
          :key="filter.id"
          :filter="filter"
          @click="editFilter(filter)"
          @toggle="filterContext.toggleGlobalFilter(filter.id)"
          @remove="filterContext.removeGlobalFilter(filter.id)"
        />
      </div>

      <!-- Quick actions -->
      <div class="flex items-center gap-1">
        <Button
          v-if="activeFilterCount > 0"
          variant="ghost"
          size="sm"
          @click="filterContext.clearAllFilters()"
        >
          Clear all
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="startAddFilter"
        >
          <Plus class="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>

    <!-- Expanded View -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="isExpanded" class="px-4 pb-4 overflow-hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <!-- Filter editor (when adding/editing) -->
          <FilterEditor
            v-if="editingFilter !== null"
            :filter="editingFilter"
            :available-columns="availableColumns"
            @save="handleSaveFilter"
            @cancel="cancelEdit"
          />

          <!-- Empty state -->
          <div
            v-else-if="globalFilters.length === 0"
            class="col-span-full text-center py-8 border-2 border-dashed rounded-lg"
          >
            <Filter class="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p class="text-sm text-muted-foreground">No filters applied</p>
            <Button
              variant="link"
              size="sm"
              class="mt-2"
              @click="startAddFilter"
            >
              Add your first filter
            </Button>
          </div>

          <!-- Filter list -->
          <div
            v-else
            v-for="filter in globalFilters"
            :key="filter.id"
            :class="[
              'p-3 rounded-lg border transition-colors cursor-pointer',
              filter.isActive
                ? 'bg-card hover:border-primary/50'
                : 'bg-muted/50 opacity-60'
            ]"
            @click="editFilter(filter)"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-sm">
                {{ filter.label || filter.dimension }}
              </span>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 w-6 p-0"
                  @click.stop="filterContext.toggleGlobalFilter(filter.id)"
                >
                  <component
                    :is="filter.isActive ? Eye : EyeOff"
                    class="h-3 w-3"
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 w-6 p-0 hover:text-destructive"
                  @click.stop="filterContext.removeGlobalFilter(filter.id)"
                >
                  <X class="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getFilterDescription(filter) }}
            </p>
          </div>
        </div>

        <!-- Undo/Redo -->
        <div class="flex items-center justify-between mt-4 pt-4 border-t">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="!filterContext.canUndo.value"
              @click="filterContext.undo()"
            >
              <Undo class="h-4 w-4 mr-1" />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="!filterContext.canRedo.value"
              @click="filterContext.redo()"
            >
              <Redo class="h-4 w-4 mr-1" />
              Redo
            </Button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Filter, Plus, ChevronDown, X, Eye, EyeOff, Undo, Redo
} from 'lucide-vue-next'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import FilterChip from './FilterChip.vue'
import FilterEditor from './FilterEditor.vue'
import type { FilterValue, FilterOperator } from '~/types/filter-context'
import { useFilterContext } from '~/composables/useFilterContext'

interface ColumnInfo {
  name: string
  type: string
  table?: string
}

interface Props {
  dashboardId: string
  viewAlias: string
  availableColumns?: ColumnInfo[]
}

const props = withDefaults(defineProps<Props>(), {
  availableColumns: () => []
})

const emit = defineEmits<{
  filtersChanged: []
}>()

// Filter context
const filterContext = useFilterContext(props.dashboardId, props.viewAlias)
const globalFilters = filterContext.globalFilters
const activeFilterCount = filterContext.activeFilterCount

// UI State
const isExpanded = ref(false)
const editingFilter = ref<FilterValue | null>(null)

// Computed
const activeFilters = computed(() =>
  globalFilters.value.filter(f => f.isActive && f.dimension)
)

// Methods
function startAddFilter() {
  editingFilter.value = null // null means "new filter"
  isExpanded.value = true
}

function editFilter(filter: FilterValue) {
  editingFilter.value = filter
  isExpanded.value = true
}

function cancelEdit() {
  editingFilter.value = null
}

function handleSaveFilter(filter: FilterValue) {
  const existing = globalFilters.value.find(f => f.id === filter.id)
  if (existing) {
    filterContext.updateGlobalFilter(filter.id, filter)
  } else {
    filterContext.addGlobalFilter(filter)
  }
  editingFilter.value = null
  emit('filtersChanged')
}

const operatorLabels: Record<FilterOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  greater_than: 'is greater than',
  greater_than_equals: 'is at least',
  less_than: 'is less than',
  less_than_equals: 'is at most',
  in: 'is one of',
  not_in: 'is not one of',
  like: 'contains',
  not_like: 'does not contain',
  is_null: 'is empty',
  is_not_null: 'is not empty',
  between: 'is between',
  not_between: 'is not between'
}

function getFilterDescription(filter: FilterValue): string {
  const op = operatorLabels[filter.operator] || filter.operator

  if (filter.operator === 'is_null' || filter.operator === 'is_not_null') {
    return `${filter.dimension} ${op}`
  }

  if (filter.operator === 'in' || filter.operator === 'not_in') {
    const count = filter.values?.length || 0
    return `${filter.dimension} ${op} ${count} value${count !== 1 ? 's' : ''}`
  }

  if (filter.operator === 'between' || filter.operator === 'not_between') {
    return `${filter.dimension} ${op} ${filter.minValue} and ${filter.maxValue}`
  }

  return `${filter.dimension} ${op} "${filter.value}"`
}
</script>
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/components/filters/FilterPanel.vue
git commit -m "feat(filters): add FilterPanel component with full UI"
```

---

## Task 6: Create Backend Filter Override Schema

**Files:**
- Create: `cortex/api/schemas/requests/filters.py`

**Step 1: Create the filter override request schema**

```python
# cortex/api/schemas/requests/filters.py
"""Request schemas for dynamic filter operations."""

from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field
from cortex.core.types.semantics.filter import FilterOperator, FilterValueType, FilterType


class RuntimeFilterRequest(BaseModel):
    """
    A single runtime filter to apply during widget execution.
    Maps to SemanticFilter but with simplified structure for API consumers.
    """
    dimension: str = Field(..., description="Column/field name to filter on")
    table: Optional[str] = Field(None, description="Table name for qualified columns")
    operator: FilterOperator = Field(FilterOperator.EQUALS, description="Filter operator")
    value: Optional[Any] = Field(None, description="Single value for comparison operators")
    values: Optional[List[Any]] = Field(None, description="Multiple values for IN/NOT_IN operators")
    min_value: Optional[Any] = Field(None, description="Min value for BETWEEN operator")
    max_value: Optional[Any] = Field(None, description="Max value for BETWEEN operator")
    value_type: FilterValueType = Field(FilterValueType.STRING, description="Value type hint")
    filter_type: FilterType = Field(FilterType.WHERE, description="WHERE or HAVING clause")
    is_active: bool = Field(True, description="Whether filter is active")

    class Config:
        use_enum_values = True


class WidgetExecutionWithFiltersRequest(BaseModel):
    """
    Request to execute a widget with runtime filter overrides.
    """
    filters: Optional[List[RuntimeFilterRequest]] = Field(
        None,
        description="Runtime filters to merge with widget's existing filters"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        None,
        description="Runtime parameters to merge with widget's existing parameters"
    )
    context_id: Optional[str] = Field(
        None,
        description="Override the context_id for this execution"
    )
    limit: Optional[int] = Field(
        None,
        description="Override the result limit"
    )
    replace_filters: bool = Field(
        False,
        description="If True, replace existing filters entirely. If False, merge with existing."
    )


class DashboardExecutionWithFiltersRequest(BaseModel):
    """
    Request to execute a dashboard with runtime filter overrides.
    Filters are applied globally to all widgets unless widget-specific overrides are provided.
    """
    global_filters: Optional[List[RuntimeFilterRequest]] = Field(
        None,
        description="Filters to apply to all widgets in the dashboard"
    )
    widget_filters: Optional[Dict[str, List[RuntimeFilterRequest]]] = Field(
        None,
        description="Widget-specific filters keyed by widget alias"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        None,
        description="Global parameters to apply to all widgets"
    )
    context_id: Optional[str] = Field(
        None,
        description="Override the context_id for all widgets"
    )
```

**Step 2: Commit**

```bash
git add cortex/api/schemas/requests/filters.py
git commit -m "feat(api): add filter override request schemas"
```

---

## Task 7: Create Filter Conversion Utility

**Files:**
- Create: `cortex/core/filters/converter.py`

**Step 1: Create the filter converter utility**

```python
# cortex/core/filters/converter.py
"""Utilities for converting between filter representations."""

from typing import List, Optional, Any, Dict
from cortex.core.semantics.filters import SemanticFilter
from cortex.core.types.semantics.filter import FilterOperator, FilterValueType, FilterType


def runtime_filter_to_semantic(
    dimension: str,
    operator: FilterOperator,
    value: Optional[Any] = None,
    values: Optional[List[Any]] = None,
    min_value: Optional[Any] = None,
    max_value: Optional[Any] = None,
    table: Optional[str] = None,
    value_type: FilterValueType = FilterValueType.STRING,
    filter_type: FilterType = FilterType.WHERE,
    is_active: bool = True,
    name: Optional[str] = None,
) -> SemanticFilter:
    """
    Convert runtime filter parameters to a SemanticFilter instance.

    Args:
        dimension: Column/field name to filter on
        operator: Filter operator (equals, in, between, etc.)
        value: Single value for simple operators
        values: List of values for IN/NOT_IN operators
        min_value: Min value for BETWEEN operator
        max_value: Max value for BETWEEN operator
        table: Optional table name for qualified columns
        value_type: Type hint for the value
        filter_type: WHERE or HAVING clause
        is_active: Whether filter is active
        name: Optional name for the filter (auto-generated if not provided)

    Returns:
        SemanticFilter instance ready for use in query execution
    """
    # Auto-generate name if not provided
    if name is None:
        name = f"runtime_{dimension}_{operator.value if hasattr(operator, 'value') else operator}"

    return SemanticFilter(
        name=name,
        query=dimension,
        table=table,
        operator=operator,
        value=value,
        values=values,
        min_value=min_value,
        max_value=max_value,
        value_type=value_type,
        filter_type=filter_type,
        is_active=is_active,
    )


def merge_filters(
    existing_filters: Optional[List[SemanticFilter]],
    runtime_filters: List[SemanticFilter],
    replace: bool = False,
) -> List[SemanticFilter]:
    """
    Merge runtime filters with existing metric filters.

    Args:
        existing_filters: Existing filters from metric definition
        runtime_filters: Runtime filters to add/merge
        replace: If True, replace existing entirely. If False, merge by name.

    Returns:
        Merged list of SemanticFilter instances
    """
    if replace or not existing_filters:
        return runtime_filters if runtime_filters else (existing_filters or [])

    # Build a map of existing filters by name
    merged = {f.name: f for f in existing_filters}

    # Merge runtime filters (override by name if exists)
    for rf in runtime_filters:
        merged[rf.name] = rf

    return list(merged.values())


def dict_to_semantic_filters(filter_dict: Dict[str, Any]) -> List[SemanticFilter]:
    """
    Convert a simple dict of {dimension: value} to SemanticFilter list.
    Useful for simple equality filters.

    Args:
        filter_dict: Dict mapping column names to values

    Returns:
        List of SemanticFilter instances with 'equals' operator
    """
    filters = []
    for dimension, value in filter_dict.items():
        if isinstance(value, list):
            filters.append(runtime_filter_to_semantic(
                dimension=dimension,
                operator=FilterOperator.IN,
                values=value,
            ))
        else:
            filters.append(runtime_filter_to_semantic(
                dimension=dimension,
                operator=FilterOperator.EQUALS,
                value=value,
            ))
    return filters
```

**Step 2: Commit**

```bash
git add cortex/core/filters/converter.py
git commit -m "feat(filters): add filter conversion utilities"
```

---

## Task 8: Add Widget Execution with Filters Endpoint

**Files:**
- Modify: `cortex/api/routers/dashboards/dashboards.py`

**Step 1: Add the new endpoint**

Add these imports at the top of the file:

```python
from cortex.api.schemas.requests.filters import (
    RuntimeFilterRequest,
    WidgetExecutionWithFiltersRequest,
    DashboardExecutionWithFiltersRequest
)
from cortex.core.filters.converter import runtime_filter_to_semantic, merge_filters
from cortex.core.semantics.metrics.modifiers import MetricModifier, MetricModifiers
```

Add the new endpoint after the existing `execute_widget` endpoint (around line 433):

```python
@DashboardRouter.post(
    "/dashboards/{dashboard_id}/views/{view_alias}/widgets/{widget_alias}/execute/filtered",
    response_model=WidgetExecutionResponse,
    tags=["Dashboards", "Filters"]
)
async def execute_widget_with_filters(
    dashboard_id: UUID,
    view_alias: str,
    widget_alias: str,
    request: WidgetExecutionWithFiltersRequest
):
    """
    Execute a specific widget with runtime filter overrides.

    This endpoint allows dynamic filtering without modifying the widget configuration.
    Runtime filters are merged with (or replace) the widget's existing filters based
    on the replace_filters flag.

    Use cases:
    - Interactive "slice" filtering on dashboards
    - Cross-widget filtering (clicking on one widget filters others)
    - User-applied filters without admin privileges
    """
    try:
        # Get dashboard
        dashboard = DashboardCRUD.get_dashboard_by_id(dashboard_id)
        if dashboard is None:
            raise DashboardDoesNotExistError(dashboard_id)

        # Find view
        view = next((v for v in dashboard.views if v.alias == view_alias), None)
        if view is None:
            raise DashboardViewDoesNotExistError(view_alias)

        # Find widget
        widget = None
        for section in view.sections:
            widget = next((w for w in section.widgets if w.alias == widget_alias), None)
            if widget:
                break

        if widget is None:
            raise WidgetExecutionError(f"Widget '{widget_alias}' not found in view '{view_alias}'")

        # Convert runtime filters to SemanticFilter instances
        runtime_semantic_filters = []
        if request.filters:
            for rf in request.filters:
                if rf.is_active:
                    runtime_semantic_filters.append(runtime_filter_to_semantic(
                        dimension=rf.dimension,
                        operator=rf.operator,
                        value=rf.value,
                        values=rf.values,
                        min_value=rf.min_value,
                        max_value=rf.max_value,
                        table=rf.table,
                        value_type=rf.value_type,
                        filter_type=rf.filter_type,
                        is_active=True,
                    ))

        # Build metric modifiers with runtime filters
        modifier = MetricModifier(
            filters=runtime_semantic_filters if runtime_semantic_filters else None,
            limit=request.limit,
        )
        modifiers: MetricModifiers = [modifier] if runtime_semantic_filters or request.limit else None

        # Determine context and parameters
        context_id = request.context_id or (widget.metric_overrides.context_id if widget.metric_overrides else None) or view.context_id
        parameters = request.parameters or (widget.metric_overrides.parameters if widget.metric_overrides else None)

        # Execute the metric
        execution_service = DashboardExecutionService()

        result = execution_service.execute_widget(
            widget=widget,
            environment_id=dashboard.environment_id,
            context_id=context_id,
            parameters=parameters,
            modifiers=modifiers,
        )

        return WidgetExecutionResponse(
            widget_id=widget_alias,
            data=result.data if hasattr(result, 'data') else result,
            execution_time_ms=result.execution_time_ms if hasattr(result, 'execution_time_ms') else None,
        )

    except DashboardDoesNotExistError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DashboardViewDoesNotExistError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except WidgetExecutionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
```

**Step 2: Create missing __init__.py**

```bash
mkdir -p /home/ianad/repo/cortex/cortex/core/filters
touch /home/ianad/repo/cortex/cortex/core/filters/__init__.py
```

**Step 3: Commit**

```bash
git add cortex/api/routers/dashboards/dashboards.py
git add cortex/core/filters/__init__.py
git commit -m "feat(api): add widget execution with runtime filters endpoint"
```

---

## Task 9: Update Frontend Dashboard Composable

**Files:**
- Modify: `frontend/cortex/app/composables/useDashboards.ts`

**Step 1: Add the executeWidgetWithFilters function**

Add after the `executeWidget` function (around line 317):

```typescript
async function executeWidgetWithFilters(
  dashboardId: string,
  viewId: string,
  widgetId: string,
  filters?: Array<{
    dimension: string
    operator: string
    value?: any
    values?: any[]
    min_value?: any
    max_value?: any
    table?: string
    value_type?: string
    filter_type?: string
    is_active?: boolean
  }>,
  options?: {
    parameters?: Record<string, any>
    context_id?: string
    limit?: number
    replace_filters?: boolean
  }
) {
  loading.value = true
  error.value = null

  try {
    const result = await $fetch<WidgetExecutionResult>(
      apiUrl(`/api/v1/dashboards/${dashboardId}/views/${viewId}/widgets/${widgetId}/execute/filtered`),
      {
        method: 'POST',
        body: {
          filters: filters?.map(f => ({
            dimension: f.dimension,
            operator: f.operator || 'equals',
            value: f.value,
            values: f.values,
            min_value: f.min_value,
            max_value: f.max_value,
            table: f.table,
            value_type: f.value_type || 'string',
            filter_type: f.filter_type || 'where',
            is_active: f.is_active ?? true
          })),
          parameters: options?.parameters,
          context_id: options?.context_id,
          limit: options?.limit,
          replace_filters: options?.replace_filters ?? false
        }
      }
    )

    return result
  } catch (err: any) {
    error.value = err.message || 'Failed to execute widget with filters'
    throw err
  } finally {
    loading.value = false
  }
}
```

Add `executeWidgetWithFilters` to the return statement.

**Step 2: Commit**

```bash
git add frontend/cortex/app/composables/useDashboards.ts
git commit -m "feat(dashboards): add executeWidgetWithFilters to composable"
```

---

## Task 10: Integrate FilterPanel into Dashboard View

**Files:**
- Modify: `frontend/cortex/app/pages/dashboards/[id].vue` (or wherever dashboard view is)

**Step 1: Find and read the dashboard page**

First, locate the dashboard detail page and understand its current structure.

**Step 2: Add FilterPanel import and integration**

Add FilterPanel to the dashboard page's template, passing required props:

```vue
<FilterPanel
  v-if="currentDashboard && currentView"
  :dashboard-id="currentDashboard.id"
  :view-alias="currentView.alias"
  :available-columns="availableColumns"
  @filters-changed="handleFiltersChanged"
/>
```

Add script logic:
- Import `useFilterContext` composable
- Create `handleFiltersChanged` function that re-executes widgets with new filters
- Compute `availableColumns` from the dashboard's data sources/models

**Step 3: Commit**

```bash
git add frontend/cortex/app/pages/dashboards/[id].vue
git commit -m "feat(dashboards): integrate FilterPanel into dashboard view"
```

---

## Task 11: Wire Up Widget Re-execution on Filter Change

**Files:**
- Modify: Dashboard page (same file as Task 10)

**Step 1: Create widget re-execution logic**

When filters change, iterate through visible widgets and re-execute them with the new filters:

```typescript
const filterContext = useFilterContext(dashboardId, viewAlias)

async function handleFiltersChanged() {
  if (!currentView.value) return

  // Get all widgets in current view
  for (const section of currentView.value.sections) {
    for (const widget of section.widgets) {
      // Get effective filters for this widget
      const filters = filterContext.getFiltersForApi(widget.alias)

      // Re-execute widget with filters
      try {
        const result = await executeWidgetWithFilters(
          dashboardId,
          currentView.value.alias,
          widget.alias,
          filters
        )

        // Update widget data in local state
        updateWidgetData(widget.alias, result.data)
      } catch (error) {
        console.error(`Failed to execute widget ${widget.alias}:`, error)
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add frontend/cortex/app/pages/dashboards/[id].vue
git commit -m "feat(dashboards): wire up widget re-execution on filter change"
```

---

## Task 12: Add Loading States and Error Handling

**Files:**
- Modify: Dashboard page and widget components

**Step 1: Add per-widget loading states**

Track loading state per widget during filtered execution:

```typescript
const widgetLoadingStates = ref<Map<string, boolean>>(new Map())
const widgetErrors = ref<Map<string, string>>(new Map())

async function executeWidgetWithFiltersWrapped(widgetAlias: string, filters: any[]) {
  widgetLoadingStates.value.set(widgetAlias, true)
  widgetErrors.value.delete(widgetAlias)

  try {
    const result = await executeWidgetWithFilters(...)
    return result
  } catch (error) {
    widgetErrors.value.set(widgetAlias, error.message)
    throw error
  } finally {
    widgetLoadingStates.value.set(widgetAlias, false)
  }
}
```

**Step 2: Show loading overlay on widgets during re-execution**

Pass loading state to widget components and show a subtle loading indicator.

**Step 3: Commit**

```bash
git add .
git commit -m "feat(dashboards): add loading states and error handling for filtered execution"
```

---

## Task 13: Final Integration Test

**Step 1: Start the development servers**

```bash
# Terminal 1: Backend
poetry run uvicorn cortex.api.main:app --reload --host 0.0.0.0 --port 9002

# Terminal 2: Frontend
cd frontend/cortex && yarn dev
```

**Step 2: Manual testing checklist**

1. Navigate to a dashboard with widgets
2. Verify FilterPanel appears at the top of the dashboard
3. Click "Add" to add a new filter
4. Select a column, operator, and value
5. Verify the filter chip appears
6. Verify widgets re-execute and show filtered data
7. Toggle filter active/inactive
8. Remove filter
9. Test undo/redo
10. Refresh page and verify filters persist

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(slice-dice): complete Phase 1 interactive filter system"
```

---

## Summary

This plan implements Phase 1 of the Slice & Dice feature:

| Component | Files | Purpose |
|-----------|-------|---------|
| Types | `types/filter-context.ts` | Filter value types, context interfaces |
| State | `composables/useFilterContext.ts` | Filter state management with persistence |
| UI | `components/filters/FilterChip.vue` | Compact filter display |
| UI | `components/filters/FilterEditor.vue` | Full filter editing form |
| UI | `components/filters/FilterPanel.vue` | Dashboard filter bar |
| API | `schemas/requests/filters.py` | Request validation schemas |
| Core | `core/filters/converter.py` | Filter format conversion |
| API | `routers/dashboards.py` | New `/execute/filtered` endpoint |
| Integration | `composables/useDashboards.ts` | API client update |
| Integration | Dashboard page | Wire everything together |

Total: ~12 tasks, each completable in 5-15 minutes.

---

**Next Phase (Phase 2):** Dynamic Dimension Switching - allowing users to change the grouping/breakdown of data on-the-fly.
