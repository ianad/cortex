import { ref, computed, readonly, watch, type Ref, type ComputedRef } from 'vue'
import type {
  FilterValue,
  WidgetFilterOverride,
  FilterHistoryEntry,
  DashboardFilterContext
} from '~/types/filter-context'
import {
  filterValueToSemanticFilter,
  generateFilterId,
  createEmptyFilter
} from '~/types/filter-context'
import type { SemanticFilter } from '~/types/output-formats'

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_SIZE = 50

// ============================================================================
// Persistence Helpers
// ============================================================================

/**
 * Generates the localStorage key for filter context
 */
function getStorageKey(dashboardId: string, viewAlias: string): string {
  return `cortex_filter_context_${dashboardId}_${viewAlias}`
}

/**
 * Serializes the filter context for localStorage
 * Converts Map to array of entries for JSON compatibility
 */
function serializeFilterContext(context: {
  globalFilters: FilterValue[]
  widgetOverrides: Map<string, WidgetFilterOverride>
  crossFilteringEnabled: boolean
  filterHistory: FilterHistoryEntry[]
  historyIndex: number
}): string {
  return JSON.stringify({
    globalFilters: context.globalFilters,
    widgetOverrides: Array.from(context.widgetOverrides.entries()),
    crossFilteringEnabled: context.crossFilteringEnabled,
    filterHistory: context.filterHistory.map(entry => ({
      ...entry,
      widgetOverrides: Array.from(entry.widgetOverrides.entries())
    })),
    historyIndex: context.historyIndex
  })
}

/**
 * Deserializes the filter context from localStorage
 * Converts array of entries back to Map
 */
function deserializeFilterContext(json: string): {
  globalFilters: FilterValue[]
  widgetOverrides: Map<string, WidgetFilterOverride>
  crossFilteringEnabled: boolean
  filterHistory: FilterHistoryEntry[]
  historyIndex: number
} | null {
  try {
    const parsed = JSON.parse(json)
    return {
      globalFilters: parsed.globalFilters || [],
      widgetOverrides: new Map(parsed.widgetOverrides || []),
      crossFilteringEnabled: parsed.crossFilteringEnabled ?? true,
      filterHistory: (parsed.filterHistory || []).map((entry: any) => ({
        ...entry,
        widgetOverrides: new Map(entry.widgetOverrides || [])
      })),
      historyIndex: parsed.historyIndex ?? -1
    }
  } catch {
    return null
  }
}

// ============================================================================
// Composable
// ============================================================================

export function useFilterContext(dashboardId: string, viewAlias: string) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const globalFilters: Ref<FilterValue[]> = ref([])
  const widgetOverrides: Ref<Map<string, WidgetFilterOverride>> = ref(new Map())
  const crossFilteringEnabled: Ref<boolean> = ref(true)
  const filterHistory: Ref<FilterHistoryEntry[]> = ref([])
  const historyIndex: Ref<number> = ref(-1)

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------

  /**
   * Whether any active filters exist (global or widget-specific)
   */
  const hasActiveFilters: ComputedRef<boolean> = computed(() => {
    const hasActiveGlobal = globalFilters.value.some(f => f.isActive)
    if (hasActiveGlobal) return true

    for (const override of widgetOverrides.value.values()) {
      if (override.filters.some(f => f.isActive)) {
        return true
      }
    }
    return false
  })

  /**
   * Count of all active filters (global + widget-specific)
   */
  const activeFilterCount: ComputedRef<number> = computed(() => {
    let count = globalFilters.value.filter(f => f.isActive).length

    for (const override of widgetOverrides.value.values()) {
      count += override.filters.filter(f => f.isActive).length
    }

    return count
  })

  /**
   * Whether undo is available
   */
  const canUndo: ComputedRef<boolean> = computed(() => {
    return historyIndex.value > 0
  })

  /**
   * Whether redo is available
   */
  const canRedo: ComputedRef<boolean> = computed(() => {
    return historyIndex.value < filterHistory.value.length - 1
  })

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Saves current state to localStorage
   */
  function saveToStorage(): void {
    try {
      const key = getStorageKey(dashboardId, viewAlias)
      const data = serializeFilterContext({
        globalFilters: globalFilters.value,
        widgetOverrides: widgetOverrides.value,
        crossFilteringEnabled: crossFilteringEnabled.value,
        filterHistory: filterHistory.value,
        historyIndex: historyIndex.value
      })
      localStorage.setItem(key, data)
    } catch (error) {
      console.warn('Failed to save filter context to localStorage:', error)
    }
  }

  /**
   * Loads state from localStorage
   */
  function loadFromStorage(): void {
    try {
      const key = getStorageKey(dashboardId, viewAlias)
      const data = localStorage.getItem(key)
      if (data) {
        const parsed = deserializeFilterContext(data)
        if (parsed) {
          globalFilters.value = parsed.globalFilters
          widgetOverrides.value = parsed.widgetOverrides
          crossFilteringEnabled.value = parsed.crossFilteringEnabled
          filterHistory.value = parsed.filterHistory
          historyIndex.value = parsed.historyIndex
        }
      }
    } catch (error) {
      console.warn('Failed to load filter context from localStorage:', error)
    }
  }

  // Watch for changes and persist
  watch(
    [globalFilters, widgetOverrides, crossFilteringEnabled],
    () => {
      saveToStorage()
    },
    { deep: true }
  )

  // Load on initialization
  loadFromStorage()

  // -------------------------------------------------------------------------
  // History Methods
  // -------------------------------------------------------------------------

  /**
   * Saves the current state to history
   */
  function saveToHistory(description: string): void {
    // If we're not at the end of history, truncate forward history
    if (historyIndex.value < filterHistory.value.length - 1) {
      filterHistory.value = filterHistory.value.slice(0, historyIndex.value + 1)
    }

    // Create a deep copy of current state
    const entry: FilterHistoryEntry = {
      timestamp: Date.now(),
      globalFilters: JSON.parse(JSON.stringify(globalFilters.value)),
      widgetOverrides: new Map(
        Array.from(widgetOverrides.value.entries()).map(([key, value]) => [
          key,
          JSON.parse(JSON.stringify(value))
        ])
      ),
      description
    }

    filterHistory.value.push(entry)

    // Trim history if it exceeds max size
    if (filterHistory.value.length > MAX_HISTORY_SIZE) {
      filterHistory.value = filterHistory.value.slice(-MAX_HISTORY_SIZE)
    }

    historyIndex.value = filterHistory.value.length - 1
    saveToStorage()
  }

  /**
   * Undoes the last filter change
   */
  function undo(): void {
    if (!canUndo.value) return

    historyIndex.value--
    const entry = filterHistory.value[historyIndex.value]
    if (entry) {
      globalFilters.value = JSON.parse(JSON.stringify(entry.globalFilters))
      widgetOverrides.value = new Map(
        Array.from(entry.widgetOverrides.entries()).map(([key, value]) => [
          key,
          JSON.parse(JSON.stringify(value))
        ])
      )
    }
    saveToStorage()
  }

  /**
   * Redoes the previously undone filter change
   */
  function redo(): void {
    if (!canRedo.value) return

    historyIndex.value++
    const entry = filterHistory.value[historyIndex.value]
    if (entry) {
      globalFilters.value = JSON.parse(JSON.stringify(entry.globalFilters))
      widgetOverrides.value = new Map(
        Array.from(entry.widgetOverrides.entries()).map(([key, value]) => [
          key,
          JSON.parse(JSON.stringify(value))
        ])
      )
    }
    saveToStorage()
  }

  // -------------------------------------------------------------------------
  // Global Filter Methods
  // -------------------------------------------------------------------------

  /**
   * Adds a new global filter
   * @param filter - Optional partial filter to merge with defaults
   * @returns The created filter
   */
  function addGlobalFilter(filter?: Partial<FilterValue>): FilterValue {
    const newFilter: FilterValue = {
      ...createEmptyFilter(filter?.dimension),
      ...filter,
      id: filter?.id || generateFilterId()
    }

    globalFilters.value.push(newFilter)
    saveToHistory(`Added global filter: ${newFilter.dimension || 'new filter'}`)

    return newFilter
  }

  /**
   * Updates an existing global filter
   * @param filterId - ID of the filter to update
   * @param updates - Partial updates to apply
   */
  function updateGlobalFilter(filterId: string, updates: Partial<FilterValue>): void {
    const index = globalFilters.value.findIndex(f => f.id === filterId)
    if (index === -1) return

    const filter = globalFilters.value[index]
    if (!filter) return

    globalFilters.value[index] = { ...filter, ...updates } as FilterValue
    saveToHistory(`Updated global filter: ${filter.dimension}`)
  }

  /**
   * Removes a global filter
   * @param filterId - ID of the filter to remove
   */
  function removeGlobalFilter(filterId: string): void {
    const filter = globalFilters.value.find(f => f.id === filterId)
    if (!filter) return

    globalFilters.value = globalFilters.value.filter(f => f.id !== filterId)
    saveToHistory(`Removed global filter: ${filter.dimension}`)
  }

  /**
   * Toggles the active state of a global filter
   * @param filterId - ID of the filter to toggle
   */
  function toggleGlobalFilter(filterId: string): void {
    const filter = globalFilters.value.find(f => f.id === filterId)
    if (!filter) return

    filter.isActive = !filter.isActive
    saveToHistory(`${filter.isActive ? 'Enabled' : 'Disabled'} global filter: ${filter.dimension}`)
  }

  /**
   * Clears all filters (global and widget-specific)
   */
  function clearAllFilters(): void {
    if (globalFilters.value.length === 0 && widgetOverrides.value.size === 0) {
      return
    }

    globalFilters.value = []
    widgetOverrides.value = new Map()
    saveToHistory('Cleared all filters')
  }

  // -------------------------------------------------------------------------
  // Widget Filter Methods
  // -------------------------------------------------------------------------

  /**
   * Sets filters for a specific widget
   * @param widgetAlias - Alias of the widget
   * @param filters - Filters to apply to the widget
   * @param ignoreGlobal - Whether this widget should ignore global filters
   */
  function setWidgetFilters(
    widgetAlias: string,
    filters: FilterValue[],
    ignoreGlobal: boolean = false
  ): void {
    const override: WidgetFilterOverride = {
      widgetAlias,
      filters,
      ignoreGlobalFilters: ignoreGlobal
    }

    widgetOverrides.value.set(widgetAlias, override)
    saveToHistory(`Set filters for widget: ${widgetAlias}`)
  }

  /**
   * Clears filters for a specific widget
   * @param widgetAlias - Alias of the widget
   */
  function clearWidgetFilters(widgetAlias: string): void {
    if (!widgetOverrides.value.has(widgetAlias)) return

    widgetOverrides.value.delete(widgetAlias)
    saveToHistory(`Cleared filters for widget: ${widgetAlias}`)
  }

  /**
   * Gets the effective filters for a widget (merged global + widget-specific)
   * @param widgetAlias - Alias of the widget
   * @returns Array of effective filters
   */
  function getEffectiveFilters(widgetAlias: string): FilterValue[] {
    const override = widgetOverrides.value.get(widgetAlias)

    // If widget ignores global filters, only return widget-specific filters
    if (override?.ignoreGlobalFilters) {
      return override.filters.filter(f => f.isActive)
    }

    // Start with active global filters
    const effectiveFilters = globalFilters.value.filter(f => f.isActive)

    // Add widget-specific filters if they exist
    if (override) {
      const widgetFilters = override.filters.filter(f => f.isActive)

      // Widget filters with the same dimension override global filters
      for (const widgetFilter of widgetFilters) {
        const existingIndex = effectiveFilters.findIndex(
          f => f.dimension === widgetFilter.dimension && f.table === widgetFilter.table
        )
        if (existingIndex !== -1) {
          effectiveFilters[existingIndex] = widgetFilter
        } else {
          effectiveFilters.push(widgetFilter)
        }
      }
    }

    return effectiveFilters
  }

  /**
   * Gets filters for a widget in the API's SemanticFilter[] format
   * @param widgetAlias - Alias of the widget
   * @returns Array of SemanticFilter objects ready for API calls
   */
  function getFiltersForApi(widgetAlias: string): SemanticFilter[] {
    const effectiveFilters = getEffectiveFilters(widgetAlias)
    return effectiveFilters.map(filterValueToSemanticFilter)
  }

  // -------------------------------------------------------------------------
  // Settings Methods
  // -------------------------------------------------------------------------

  /**
   * Sets whether cross-filtering is enabled
   * @param enabled - Whether cross-filtering should be enabled
   */
  function setCrossFiltering(enabled: boolean): void {
    crossFilteringEnabled.value = enabled
    saveToHistory(`${enabled ? 'Enabled' : 'Disabled'} cross-filtering`)
  }

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // State (readonly to prevent external mutation)
    globalFilters: readonly(globalFilters),
    widgetOverrides: readonly(widgetOverrides),
    crossFilteringEnabled: readonly(crossFilteringEnabled),
    filterHistory: readonly(filterHistory),
    historyIndex: readonly(historyIndex),

    // Computed
    hasActiveFilters,
    activeFilterCount,
    canUndo,
    canRedo,

    // Global Filter Methods
    addGlobalFilter,
    updateGlobalFilter,
    removeGlobalFilter,
    toggleGlobalFilter,
    clearAllFilters,

    // Widget Filter Methods
    setWidgetFilters,
    clearWidgetFilters,
    getEffectiveFilters,
    getFiltersForApi,

    // History Methods
    undo,
    redo,

    // Settings
    setCrossFiltering
  }
}
