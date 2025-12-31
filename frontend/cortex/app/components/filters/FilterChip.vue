<script setup lang="ts">
import { computed } from 'vue'
import { Filter, Eye, EyeOff, X } from 'lucide-vue-next'
import type { FilterValue } from '~/types/filter-context'
import { Button } from '~/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'

interface Props {
  filter: FilterValue
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
  toggle: []
  remove: []
}>()

/**
 * Get the display label for the filter
 */
const displayLabel = computed(() => {
  return props.filter.label || props.filter.dimension
})

/**
 * Convert operator to display symbol
 */
const operatorLabel = computed(() => {
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
  return operatorMap[props.filter.operator] || props.filter.operator
})

/**
 * Format the filter value for display
 */
const displayValue = computed(() => {
  const { operator, value, values, minValue, maxValue } = props.filter

  // For null operators, show nothing
  if (operator === 'is_null' || operator === 'is_not_null') {
    return ''
  }

  // For in/not_in operators, show count or list
  if (operator === 'in' || operator === 'not_in') {
    if (values && values.length > 0) {
      if (values.length <= 2) {
        return `(${values.join(', ')})`
      }
      return `(${values.length} values)`
    }
    return ''
  }

  // For between operators, show range
  if (operator === 'between' || operator === 'not_between') {
    if (minValue !== undefined && maxValue !== undefined) {
      return `${minValue} - ${maxValue}`
    }
    return ''
  }

  // For other operators, truncate value if needed
  if (value !== undefined && value !== null) {
    const strValue = String(value)
    if (strValue.length > 20) {
      return strValue.substring(0, 20) + '...'
    }
    return strValue
  }

  return ''
})

/**
 * Full value for tooltip (untruncated)
 */
const fullDisplayValue = computed(() => {
  const { operator, value, values, minValue, maxValue } = props.filter

  if (operator === 'is_null' || operator === 'is_not_null') {
    return ''
  }

  if (operator === 'in' || operator === 'not_in') {
    if (values && values.length > 0) {
      return values.join(', ')
    }
    return ''
  }

  if (operator === 'between' || operator === 'not_between') {
    if (minValue !== undefined && maxValue !== undefined) {
      return `${minValue} - ${maxValue}`
    }
    return ''
  }

  if (value !== undefined && value !== null) {
    return String(value)
  }

  return ''
})

/**
 * Whether to show tooltip (when value is truncated)
 */
const showValueTooltip = computed(() => {
  const { operator, value, values } = props.filter

  if (operator === 'is_null' || operator === 'is_not_null') {
    return false
  }

  if (operator === 'in' || operator === 'not_in') {
    return values && values.length > 2
  }

  if (value !== undefined && value !== null) {
    return String(value).length > 20
  }

  return false
})
</script>

<template>
  <div
    class="filter-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm transition-all"
    :class="[
      filter.isActive
        ? 'bg-primary/10 border border-primary/30 text-foreground'
        : 'bg-muted/50 border border-muted text-muted-foreground opacity-60'
    ]"
  >
    <!-- Filter icon -->
    <Filter class="h-3.5 w-3.5 shrink-0" />

    <!-- Clickable content area (for editing) -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 hover:underline focus:outline-none focus-visible:underline"
      @click="emit('click')"
    >
      <!-- Label -->
      <span class="font-medium">{{ displayLabel }}</span>

      <!-- Operator -->
      <span class="text-muted-foreground">{{ operatorLabel }}</span>

      <!-- Value -->
      <TooltipProvider v-if="displayValue">
        <Tooltip :disabled="!showValueTooltip">
          <TooltipTrigger as-child>
            <span class="font-medium">{{ displayValue }}</span>
          </TooltipTrigger>
          <TooltipContent v-if="showValueTooltip">
            <p class="max-w-xs break-words">{{ fullDisplayValue }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </button>

    <!-- Action buttons -->
    <div class="inline-flex items-center gap-0.5 ml-1">
      <!-- Toggle (enable/disable) button -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-5 w-5 rounded-full hover:bg-background/80"
              @click.stop="emit('toggle')"
            >
              <Eye v-if="filter.isActive" class="h-3 w-3" />
              <EyeOff v-else class="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ filter.isActive ? 'Disable filter' : 'Enable filter' }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Remove button -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive"
              @click.stop="emit('remove')"
            >
              <X class="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Remove filter</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>

<style scoped>
.filter-chip {
  max-width: 100%;
}
</style>
