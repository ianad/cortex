<script setup lang="ts">
import { ref, computed } from 'vue'
import { Filter, Plus, ChevronDown, X, Undo, Redo, Eye, EyeOff, Pencil, Trash2 } from 'lucide-vue-next'
import type { FilterValue } from '~/types/filter-context'
import type { ColumnInfo } from '~/components/filters/FilterEditor.vue'
import { useFilterContext } from '~/composables/useFilterContext'
import FilterChip from '~/components/filters/FilterChip.vue'
import FilterEditor from '~/components/filters/FilterEditor.vue'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'

interface Props {
  dashboardId: string
  viewAlias: string
  availableColumns?: ColumnInfo[]
}

const props = withDefaults(defineProps<Props>(), {
  availableColumns: () => [],
})

const emit = defineEmits<{
  filtersChanged: []
}>()

// Use the filter context composable
const filterContext = useFilterContext(props.dashboardId, props.viewAlias)

// Local state
const isExpanded = ref(false)
const editingFilter = ref<FilterValue | null>(null)
const isAddingFilter = ref(false)

/**
 * Whether the filter editor is visible (adding or editing)
 */
const isEditorVisible = computed(() => isAddingFilter.value || editingFilter.value !== null)

/**
 * Get the active filter count for the badge
 */
const activeCount = computed(() => filterContext.activeFilterCount.value)

/**
 * Check if there are any filters
 */
const hasFilters = computed(() => filterContext.globalFilters.value.length > 0)

/**
 * Handle clicking a filter chip to edit
 */
function handleChipClick(filter: FilterValue) {
  editingFilter.value = filter
  isAddingFilter.value = false
  isExpanded.value = true
}

/**
 * Handle toggling a filter's active state
 */
function handleToggleFilter(filter: FilterValue) {
  filterContext.toggleGlobalFilter(filter.id)
  emit('filtersChanged')
}

/**
 * Handle removing a filter
 */
function handleRemoveFilter(filter: FilterValue) {
  filterContext.removeGlobalFilter(filter.id)
  // Close editor if we removed the filter being edited
  if (editingFilter.value?.id === filter.id) {
    editingFilter.value = null
  }
  emit('filtersChanged')
}

/**
 * Handle the add filter button click
 */
function handleAddClick() {
  isAddingFilter.value = true
  editingFilter.value = null
  isExpanded.value = true
}

/**
 * Handle clearing all filters
 */
function handleClearAll() {
  filterContext.clearAllFilters()
  editingFilter.value = null
  isAddingFilter.value = false
  emit('filtersChanged')
}

/**
 * Handle saving from the filter editor
 */
function handleEditorSave(filter: FilterValue) {
  if (isAddingFilter.value) {
    // Adding a new filter
    filterContext.addGlobalFilter(filter)
  } else if (editingFilter.value) {
    // Updating an existing filter
    filterContext.updateGlobalFilter(editingFilter.value.id, filter)
  }

  // Reset editor state
  editingFilter.value = null
  isAddingFilter.value = false
  emit('filtersChanged')
}

/**
 * Handle canceling from the filter editor
 */
function handleEditorCancel() {
  editingFilter.value = null
  isAddingFilter.value = false
}

/**
 * Handle undo action
 */
function handleUndo() {
  filterContext.undo()
  emit('filtersChanged')
}

/**
 * Handle redo action
 */
function handleRedo() {
  filterContext.redo()
  emit('filtersChanged')
}

/**
 * Get operator display label for cards
 */
function getOperatorLabel(operator: string): string {
  const operatorMap: Record<string, string> = {
    equals: '=',
    not_equals: '!=',
    greater_than: '>',
    greater_than_equals: '>=',
    less_than: '<',
    less_than_equals: '<=',
    in: 'in',
    not_in: 'not in',
    like: 'like',
    not_like: 'not like',
    is_null: 'is null',
    is_not_null: 'is not null',
    between: 'between',
    not_between: 'not between',
  }
  return operatorMap[operator] || operator
}

/**
 * Get display value for filter card
 */
function getDisplayValue(filter: FilterValue): string {
  const { operator, value, values, minValue, maxValue } = filter

  if (operator === 'is_null' || operator === 'is_not_null') {
    return ''
  }

  if (operator === 'in' || operator === 'not_in') {
    if (values && values.length > 0) {
      if (values.length <= 3) {
        return values.join(', ')
      }
      return `${values.slice(0, 2).join(', ')} +${values.length - 2} more`
    }
    return ''
  }

  if (operator === 'between' || operator === 'not_between') {
    if (minValue !== undefined && maxValue !== undefined) {
      return `${minValue} to ${maxValue}`
    }
    return ''
  }

  if (value !== undefined && value !== null) {
    return String(value)
  }

  return ''
}
</script>

<template>
  <div class="filter-panel border-b bg-muted/30">
    <Collapsible v-model:open="isExpanded">
      <!-- Collapsed View (always visible) -->
      <div class="flex items-center gap-3 px-4 py-2">
        <!-- Filter icon and label -->
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter class="h-4 w-4" />
          <span>Filters</span>
          <Badge
            v-if="activeCount > 0"
            variant="secondary"
            class="h-5 min-w-5 px-1.5"
          >
            {{ activeCount }}
          </Badge>
        </div>

        <!-- Separator -->
        <div v-if="hasFilters" class="h-4 w-px bg-border" />

        <!-- Filter chips -->
        <div v-if="hasFilters" class="flex flex-wrap items-center gap-2 flex-1">
          <FilterChip
            v-for="filter in filterContext.globalFilters.value"
            :key="filter.id"
            :filter="filter"
            @click="handleChipClick(filter)"
            @toggle="handleToggleFilter(filter)"
            @remove="handleRemoveFilter(filter)"
          />
        </div>

        <!-- Spacer when no filters -->
        <div v-else class="flex-1">
          <span class="text-sm text-muted-foreground">No filters applied</span>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1">
          <!-- Clear all button -->
          <TooltipProvider v-if="hasFilters">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs"
                  @click="handleClearAll"
                >
                  <X class="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear all filters</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- Add button -->
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 px-2"
                  @click="handleAddClick"
                >
                  <Plus class="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add a new filter</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- Expand/collapse toggle -->
          <CollapsibleTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
            >
              <ChevronDown
                class="h-4 w-4 transition-transform duration-200"
                :class="{ 'rotate-180': isExpanded }"
              />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <!-- Expanded View -->
      <CollapsibleContent class="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
        <div class="px-4 pb-4 pt-2 border-t bg-background/50">
          <!-- Filter Editor (when adding/editing) -->
          <div v-if="isEditorVisible" class="mb-4">
            <Card>
              <FilterEditor
                :filter="editingFilter"
                :available-columns="availableColumns"
                @save="handleEditorSave"
                @cancel="handleEditorCancel"
              />
            </Card>
          </div>

          <!-- Filter Cards Grid -->
          <div v-if="hasFilters && !isEditorVisible">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <Card
                v-for="filter in filterContext.globalFilters.value"
                :key="filter.id"
                class="relative group"
                :class="{ 'opacity-50': !filter.isActive }"
              >
                <CardContent class="p-4">
                  <!-- Filter details -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <Filter class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span class="font-medium text-sm truncate">
                          {{ filter.label || filter.dimension }}
                        </span>
                      </div>
                      <div class="text-sm text-muted-foreground">
                        <span class="font-mono">{{ getOperatorLabel(filter.operator) }}</span>
                        <span v-if="getDisplayValue(filter)" class="ml-1">
                          {{ getDisplayValue(filter) }}
                        </span>
                      </div>
                    </div>

                    <!-- Card actions -->
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-7 w-7"
                              @click="handleChipClick(filter)"
                            >
                              <Pencil class="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit filter</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-7 w-7"
                              @click="handleToggleFilter(filter)"
                            >
                              <Eye v-if="filter.isActive" class="h-3.5 w-3.5" />
                              <EyeOff v-else class="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{{ filter.isActive ? 'Disable' : 'Enable' }} filter</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                              @click="handleRemoveFilter(filter)"
                            >
                              <Trash2 class="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Remove filter</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <!-- Active status indicator -->
                  <Badge
                    v-if="!filter.isActive"
                    variant="outline"
                    class="absolute top-2 right-2 text-xs"
                  >
                    Disabled
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-else-if="!hasFilters && !isEditorVisible"
            class="text-center py-8"
          >
            <div class="w-12 h-12 mx-auto bg-muted rounded-lg flex items-center justify-center mb-4">
              <Filter class="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 class="text-lg font-medium mb-2">No filters applied</h3>
            <p class="text-muted-foreground mb-4 text-sm">
              Add filters to refine the data displayed in your dashboard widgets.
            </p>
            <Button @click="handleAddClick">
              <Plus class="w-4 h-4 mr-2" />
              Add Filter
            </Button>
          </div>

          <!-- Undo/Redo buttons -->
          <div
            v-if="hasFilters || filterContext.canUndo.value || filterContext.canRedo.value"
            class="flex items-center justify-end gap-2 mt-4 pt-4 border-t"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!filterContext.canUndo.value"
                    @click="handleUndo"
                  >
                    <Undo class="h-4 w-4 mr-1" />
                    Undo
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Undo last filter change</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!filterContext.canRedo.value"
                    @click="handleRedo"
                  >
                    <Redo class="h-4 w-4 mr-1" />
                    Redo
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Redo filter change</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>

<style scoped>
.filter-panel {
  transition: background-color 0.2s ease;
}

@keyframes slideDown {
  from {
    height: 0;
    opacity: 0;
  }
  to {
    height: var(--reka-collapsible-content-height);
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    height: var(--reka-collapsible-content-height);
    opacity: 1;
  }
  to {
    height: 0;
    opacity: 0;
  }
}

.animate-slideDown {
  animation: slideDown 0.2s ease-out;
}

.animate-slideUp {
  animation: slideUp 0.2s ease-out;
}
</style>
