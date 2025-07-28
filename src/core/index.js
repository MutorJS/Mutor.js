/*
RULES

1. Non dynamic children must have fixed length, if no keys are provided.
2. Dynamic children must have keys.
3. A child index may only have a null, false, or one component value.
4. Duplicate keys are not allowed.

FLOW

1. Create a component using a class, non-async function, or object.
2. Dynamic attributes are non-async functions returning string or falsy value.
3. Auto register component dependencies on render.
4. Auto update component dependencies on state change.

FUNCTIONS

1. parse() - For parsing and normalizing components.
2. registerComponentStateContextDeps() - For auto-registering component state and context dependencies.
3. render() - For initial rendering of the component.
4. mount() - For initial mounting of the component.
5. unMount() - For unmounting the component.

COMPONENT LIFE CYCLE

1. onBeforeMount()
2. onMount()
3. onUpdate()
4. onDestroy()

COMPONENT TYPE
1. element
2. fragment
3. text node
*/
