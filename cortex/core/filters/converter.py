"""
Filter conversion utilities for converting between filter representations.

This module provides utility functions for converting runtime filter parameters
to SemanticFilter instances and merging filters from different sources.
"""

from typing import Any, Dict, List, Optional

from cortex.core.semantics.filters import SemanticFilter
from cortex.core.types.semantics.filter import (
    FilterOperator,
    FilterType,
    FilterValueType,
)


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

    This function creates a SemanticFilter from individual parameters,
    making it easier to construct filters programmatically at runtime.

    Args:
        dimension: The column name or expression to filter on
        operator: The comparison operator to use (equals, in, between, etc.)
        value: The value to compare against (for single-value operators)
        values: List of values (for IN, NOT_IN operators)
        min_value: Minimum value (for BETWEEN operator)
        max_value: Maximum value (for BETWEEN operator)
        table: Optional source table name
        value_type: The type of the filter value (string, number, etc.)
        filter_type: Whether to use WHERE or HAVING clause
        is_active: Whether the filter is currently active
        name: Optional filter name (auto-generated if not provided)

    Returns:
        SemanticFilter: A configured SemanticFilter instance

    Examples:
        >>> filter = runtime_filter_to_semantic(
        ...     dimension="status",
        ...     operator=FilterOperator.EQUALS,
        ...     value="active"
        ... )

        >>> range_filter = runtime_filter_to_semantic(
        ...     dimension="price",
        ...     operator=FilterOperator.BETWEEN,
        ...     min_value=10,
        ...     max_value=100,
        ...     value_type=FilterValueType.NUMBER
        ... )
    """
    # Auto-generate name if not provided
    if name is None:
        name = f"filter_{dimension}_{operator.value}"

    return SemanticFilter(
        name=name,
        query=dimension,
        operator=operator,
        value=value,
        values=values,
        min_value=min_value,
        max_value=max_value,
        table=table,
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

    This function combines filters from two sources, with runtime filters
    taking precedence over existing filters when they have the same name.

    Args:
        existing_filters: Optional list of existing SemanticFilter instances
        runtime_filters: List of runtime SemanticFilter instances to merge
        replace: If True, return only runtime filters (ignore existing)

    Returns:
        List[SemanticFilter]: Merged list of filters

    Examples:
        >>> existing = [filter1, filter2]
        >>> runtime = [filter3]
        >>> merged = merge_filters(existing, runtime)
        >>> # merged contains filter1, filter2, filter3

        >>> # With replace=True, only runtime filters are returned
        >>> merged = merge_filters(existing, runtime, replace=True)
        >>> # merged contains only filter3
    """
    if replace:
        return runtime_filters

    if not existing_filters:
        return runtime_filters

    if not runtime_filters:
        return existing_filters

    # Create a dict of existing filters by name for efficient lookup
    merged: Dict[str, SemanticFilter] = {f.name: f for f in existing_filters}

    # Runtime filters override existing ones with the same name
    for runtime_filter in runtime_filters:
        merged[runtime_filter.name] = runtime_filter

    return list(merged.values())


def dict_to_semantic_filters(filter_dict: Dict[str, Any]) -> List[SemanticFilter]:
    """
    Convert a simple {dimension: value} dictionary to a list of SemanticFilters.

    This utility function provides a convenient way to create equality filters
    from a simple dictionary. It automatically detects list values and uses
    the IN operator for them.

    Args:
        filter_dict: Dictionary mapping dimension names to filter values.
                    If a value is a list, the IN operator is used.
                    Otherwise, the EQUALS operator is used.

    Returns:
        List[SemanticFilter]: List of SemanticFilter instances

    Examples:
        >>> filters = dict_to_semantic_filters({
        ...     "status": "active",
        ...     "region": ["US", "EU", "APAC"]
        ... })
        >>> # Creates two filters:
        >>> # - status EQUALS "active"
        >>> # - region IN ["US", "EU", "APAC"]
    """
    filters: List[SemanticFilter] = []

    for dimension, value in filter_dict.items():
        if isinstance(value, list):
            # Use IN operator for list values
            filter_instance = runtime_filter_to_semantic(
                dimension=dimension,
                operator=FilterOperator.IN,
                values=value,
            )
        else:
            # Use EQUALS operator for single values
            filter_instance = runtime_filter_to_semantic(
                dimension=dimension,
                operator=FilterOperator.EQUALS,
                value=value,
            )
        filters.append(filter_instance)

    return filters
