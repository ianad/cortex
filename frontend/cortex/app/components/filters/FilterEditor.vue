<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { FilterValue, FilterOperator, FilterValueType } from '~/types/filter-context'
import { generateFilterId } from '~/types/filter-context'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

/**
 * Column information for the dropdown
 */
export interface ColumnInfo {
  name: string
  type: FilterValueType | string
  table?: string
}

interface Props {
  filter?: FilterValue | null
  availableColumns: ColumnInfo[]
}

const props = withDefaults(defineProps<Props>(), {
  filter: null,
})

const emit = defineEmits<{
  save: [filter: FilterValue]
  cancel: []
}>()

/**
 * All supported filter operators
 */
const allOperators: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'greater_than_equals', label: 'Greater Than or Equals' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'less_than_equals', label: 'Less Than or Equals' },
  { value: 'in', label: 'In' },
  { value: 'not_in', label: 'Not In' },
  { value: 'like', label: 'Like' },
  { value: 'not_like', label: 'Not Like' },
  { value: 'is_null', label: 'Is Null' },
  { value: 'is_not_null', label: 'Is Not Null' },
  { value: 'between', label: 'Between' },
  { value: 'not_between', label: 'Not Between' },
]

/**
 * Internal form state
 */
const formState = reactive<{
  dimension: string
  table?: string
  operator: FilterOperator
  value: string
  values: string
  minValue: string
  maxValue: string
  label: string
}>({
  dimension: '',
  table: undefined,
  operator: 'equals',
  value: '',
  values: '',
  minValue: '',
  maxValue: '',
  label: '',
})

/**
 * Whether we are creating a new filter or editing an existing one
 */
const isNew = computed(() => props.filter === null || props.filter === undefined)

/**
 * Initialize form state from prop
 */
function initFormState() {
  if (props.filter) {
    formState.dimension = props.filter.dimension
    formState.table = props.filter.table
    formState.operator = props.filter.operator
    formState.value = props.filter.value !== undefined ? String(props.filter.value) : ''
    formState.values = props.filter.values ? props.filter.values.join(', ') : ''
    formState.minValue = props.filter.minValue !== undefined ? String(props.filter.minValue) : ''
    formState.maxValue = props.filter.maxValue !== undefined ? String(props.filter.maxValue) : ''
    formState.label = props.filter.label || ''
  } else {
    formState.dimension = ''
    formState.table = undefined
    formState.operator = 'equals'
    formState.value = ''
    formState.values = ''
    formState.minValue = ''
    formState.maxValue = ''
    formState.label = ''
  }
}

// Initialize on mount and when filter prop changes
watch(() => props.filter, initFormState, { immediate: true })

/**
 * Get the selected column info
 */
const selectedColumn = computed(() => {
  return props.availableColumns.find(col => col.name === formState.dimension)
})

/**
 * Determine input type based on column type
 */
const inputType = computed((): 'text' | 'number' | 'date' => {
  const colType = selectedColumn.value?.type?.toLowerCase()
  if (!colType) return 'text'

  if (colType === 'number' || colType.includes('int') || colType.includes('float') || colType.includes('decimal') || colType.includes('numeric')) {
    return 'number'
  }
  if (colType === 'date' || colType === 'timestamp' || colType.includes('datetime')) {
    return 'date'
  }
  return 'text'
})

/**
 * Whether the operator requires no value input
 */
const isNullOperator = computed(() => {
  return formState.operator === 'is_null' || formState.operator === 'is_not_null'
})

/**
 * Whether the operator requires multiple values (IN, NOT_IN)
 */
const isInOperator = computed(() => {
  return formState.operator === 'in' || formState.operator === 'not_in'
})

/**
 * Whether the operator requires range values (BETWEEN, NOT_BETWEEN)
 */
const isBetweenOperator = computed(() => {
  return formState.operator === 'between' || formState.operator === 'not_between'
})

/**
 * Whether the operator requires a single value
 */
const isSingleValueOperator = computed(() => {
  return !isNullOperator.value && !isInOperator.value && !isBetweenOperator.value
})

/**
 * Parse the comma-separated values string into an array
 */
const parsedValues = computed(() => {
  if (!formState.values.trim()) return []
  return formState.values
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0)
})

/**
 * Validate the form
 */
const isValid = computed(() => {
  // Must have a dimension selected
  if (!formState.dimension) {
    return false
  }

  // Null operators don't need values
  if (isNullOperator.value) {
    return true
  }

  // IN operators need at least one value
  if (isInOperator.value) {
    return parsedValues.value.length > 0
  }

  // BETWEEN operators need both min and max
  if (isBetweenOperator.value) {
    return formState.minValue.trim() !== '' && formState.maxValue.trim() !== ''
  }

  // Single value operators need a value
  if (isSingleValueOperator.value) {
    return formState.value.trim() !== ''
  }

  return false
})

/**
 * Handle column selection change
 */
function onColumnChange(columnName: string) {
  formState.dimension = columnName
  const col = props.availableColumns.find(c => c.name === columnName)
  formState.table = col?.table
}

/**
 * Convert value based on input type
 */
function convertValue(val: string): any {
  if (inputType.value === 'number') {
    const num = parseFloat(val)
    return isNaN(num) ? val : num
  }
  return val
}

/**
 * Build the filter value from form state
 */
function buildFilterValue(): FilterValue {
  const filter: FilterValue = {
    id: props.filter?.id || generateFilterId(),
    dimension: formState.dimension,
    operator: formState.operator,
    isActive: props.filter?.isActive ?? true,
  }

  if (formState.table) {
    filter.table = formState.table
  }

  if (formState.label.trim()) {
    filter.label = formState.label.trim()
  }

  // Set value type hint based on input type
  if (inputType.value === 'number') {
    filter.valueType = 'number'
  } else if (inputType.value === 'date') {
    filter.valueType = 'date'
  } else {
    filter.valueType = 'string'
  }

  // Set values based on operator type
  if (isInOperator.value) {
    filter.values = parsedValues.value.map(convertValue)
  } else if (isBetweenOperator.value) {
    filter.minValue = convertValue(formState.minValue.trim())
    filter.maxValue = convertValue(formState.maxValue.trim())
  } else if (isSingleValueOperator.value) {
    filter.value = convertValue(formState.value.trim())
  }

  return filter
}

/**
 * Handle save button click
 */
function handleSave() {
  if (!isValid.value) return
  emit('save', buildFilterValue())
}

/**
 * Handle cancel button click
 */
function handleCancel() {
  emit('cancel')
}

/**
 * Get display text for column type badge
 */
function getTypeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  const lowerType = type.toLowerCase()
  if (lowerType === 'number' || lowerType.includes('int') || lowerType.includes('float')) {
    return 'default'
  }
  if (lowerType === 'date' || lowerType === 'timestamp') {
    return 'secondary'
  }
  return 'outline'
}
</script>

<template>
  <div class="filter-editor space-y-4 p-4">
    <h3 class="text-lg font-medium">
      {{ isNew ? 'Add Filter' : 'Edit Filter' }}
    </h3>

    <!-- Column Selection -->
    <div class="space-y-2">
      <Label for="column-select">Column</Label>
      <Select
        :model-value="formState.dimension"
        @update:model-value="onColumnChange"
      >
        <SelectTrigger id="column-select" class="w-full">
          <SelectValue placeholder="Select a column" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="column in availableColumns"
            :key="column.name"
            :value="column.name"
          >
            <span class="flex items-center gap-2">
              <span>{{ column.name }}</span>
              <Badge :variant="getTypeBadgeVariant(column.type)" class="text-xs">
                {{ column.type }}
              </Badge>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Operator Selection -->
    <div class="space-y-2">
      <Label for="operator-select">Operator</Label>
      <Select v-model="formState.operator">
        <SelectTrigger id="operator-select" class="w-full">
          <SelectValue placeholder="Select an operator" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="op in allOperators"
            :key="op.value"
            :value="op.value"
          >
            {{ op.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Value Input - Conditional based on operator -->
    <div v-if="!isNullOperator" class="space-y-2">
      <!-- Single Value Input -->
      <template v-if="isSingleValueOperator">
        <Label for="value-input">Value</Label>
        <Input
          id="value-input"
          v-model="formState.value"
          :type="inputType"
          placeholder="Enter value"
          class="w-full"
        />
      </template>

      <!-- Multiple Values Input (IN, NOT_IN) -->
      <template v-else-if="isInOperator">
        <Label for="values-input">Values (comma-separated)</Label>
        <Input
          id="values-input"
          v-model="formState.values"
          type="text"
          placeholder="value1, value2, value3"
          class="w-full"
        />
        <p class="text-xs text-muted-foreground">
          Enter multiple values separated by commas
        </p>
      </template>

      <!-- Range Inputs (BETWEEN, NOT_BETWEEN) -->
      <template v-else-if="isBetweenOperator">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="min-value-input">Min Value</Label>
            <Input
              id="min-value-input"
              v-model="formState.minValue"
              :type="inputType"
              placeholder="Min"
            />
          </div>
          <div class="space-y-2">
            <Label for="max-value-input">Max Value</Label>
            <Input
              id="max-value-input"
              v-model="formState.maxValue"
              :type="inputType"
              placeholder="Max"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Label Input (Optional) -->
    <div class="space-y-2">
      <Label for="label-input">Label (optional)</Label>
      <Input
        id="label-input"
        v-model="formState.label"
        type="text"
        placeholder="Custom display label"
        class="w-full"
      />
      <p class="text-xs text-muted-foreground">
        Optional label for display. Defaults to column name if not provided.
      </p>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <Button
        variant="outline"
        @click="handleCancel"
      >
        Cancel
      </Button>
      <Button
        :disabled="!isValid"
        @click="handleSave"
      >
        {{ isNew ? 'Add Filter' : 'Save' }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.filter-editor {
  min-width: 320px;
}
</style>
