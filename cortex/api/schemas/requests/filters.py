"""Request schemas for runtime filter operations."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from cortex.core.types.semantics.filter import (
    FilterOperator,
    FilterType,
    FilterValueType,
)


class RuntimeFilterRequest(BaseModel):
    """A single runtime filter for query execution.

    Runtime filters allow overriding or adding filters at execution time
    without modifying the underlying metric definition.
    """

    dimension: str = Field(
        ...,
        description="Column or field name to filter on"
    )
    table: Optional[str] = Field(
        default=None,
        description="Table name containing the dimension (optional for single-table queries)"
    )
    operator: FilterOperator = Field(
        default=FilterOperator.EQUALS,
        description="Filter operator to apply"
    )
    value: Optional[Any] = Field(
        default=None,
        description="Single value for comparison operators (EQUALS, GREATER_THAN, etc.)"
    )
    values: Optional[List[Any]] = Field(
        default=None,
        description="List of values for IN/NOT_IN operators"
    )
    min_value: Optional[Any] = Field(
        default=None,
        description="Minimum value for BETWEEN operator"
    )
    max_value: Optional[Any] = Field(
        default=None,
        description="Maximum value for BETWEEN operator"
    )
    value_type: FilterValueType = Field(
        default=FilterValueType.STRING,
        description="Type hint for value conversion and comparison"
    )
    filter_type: FilterType = Field(
        default=FilterType.WHERE,
        description="Whether to apply as WHERE clause (pre-aggregation) or HAVING clause (post-aggregation)"
    )
    is_active: bool = Field(
        default=True,
        description="Whether this filter is currently active"
    )

    model_config = ConfigDict(use_enum_values=True)


class WidgetExecutionWithFiltersRequest(BaseModel):
    """Request schema for executing a widget with runtime filter overrides.

    Allows applying additional filters and parameter overrides when
    executing a dashboard widget without modifying its configuration.
    """

    filters: Optional[List[RuntimeFilterRequest]] = Field(
        default=None,
        description="Runtime filters to apply to the widget's metric query"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Runtime parameter values to override defined parameters"
    )
    context_id: Optional[str] = Field(
        default=None,
        description="Override the widget's execution context"
    )
    limit: Optional[int] = Field(
        default=None,
        description="Override the result limit for the query"
    )

    model_config = ConfigDict(use_enum_values=True)


class DashboardExecutionWithFiltersRequest(BaseModel):
    """Request schema for executing a dashboard with runtime filter overrides.

    Allows applying global filters across all widgets or per-widget filters
    when executing a dashboard without modifying its configuration.
    """

    global_filters: Optional[List[RuntimeFilterRequest]] = Field(
        default=None,
        description="Filters to apply to all widgets in the dashboard"
    )
    widget_filters: Optional[Dict[str, List[RuntimeFilterRequest]]] = Field(
        default=None,
        description="Per-widget filters keyed by widget alias or ID"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Global parameter values to apply to all widgets"
    )
    context_id: Optional[str] = Field(
        default=None,
        description="Override the execution context for all widgets"
    )

    model_config = ConfigDict(use_enum_values=True)
