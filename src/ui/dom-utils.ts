export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style'> & { dataset: Record<string, string>, style: string | Partial<CSSStyleDeclaration> }> = {},
  children: (string | Node)[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;

  // Handle dataset separately if provided, otherwise Object.assign handles standard props
  // @ts-ignore
  const { dataset, style, ...restProps } = props;
  Object.assign(element, restProps);
  
  if (style) {
    if (typeof style === 'string') {
      element.style.cssText = style;
    } else {
      Object.assign(element.style, style);
    }
  }

  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      element.dataset[key] = value;
    });
  }

  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  
  return element;
}
