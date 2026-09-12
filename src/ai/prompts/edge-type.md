{{#if anyRelationship}}
Any relationship counts: relate each one to the central node in whatever way fits it best, naming the relationship type and direction from the vocabulary above, and where the graph already has an edge between them, use it as it is.
{{/if}}

{{#if bothAxes}}
Every suggested concept X must fit this edge exactly:  {{arrow}}  — read it as "{{forwardReading}}"{{#if inverseReading}}, or from the other end, "{{inverseReading}}"{{/if}}.
Do not suggest concepts related to {{centralTitle}} in any other way, however relevant they seem.
{{/if}}

{{#if directionOnly}}
Every suggested concept X must sit at this end of its edge:  {{arrow}}.
The relationship type is yours to choose from the vocabulary above, but the direction is not.
{{/if}}

{{#if typeOnly}}
Every suggested concept X must be related to {{centralTitle}} by the {{typeName}} relationship, in whichever direction fits it.
Do not use any other relationship type.
{{/if}}
