{{#if anyRelationship}}
Any relationship counts: relate each one to the central node in whatever way fits it best, naming the edge type and direction from the vocabulary above.
{{/if}}

{{#if bothAxes}}
Every suggested concept X must fit this edge exactly:  {{arrow}}  — read it as "{{forwardReading}}"{{#if inverseReading}}, or from the other end, "{{inverseReading}}"{{/if}}.
Do not suggest concepts related to {{centralTitle}} in any other way, however relevant they seem.
{{/if}}

{{#if directionOnly}}
Every suggested concept X must sit at this end of its edge:  {{arrow}}.
The edge type is yours to choose from the vocabulary above, but the direction is not.
{{/if}}

{{#if typeOnly}}
Every suggested concept X must be related to {{centralTitle}} by an edge of type {{typeName}}, in whichever direction fits it.
Do not use any other edge type.
{{/if}}
