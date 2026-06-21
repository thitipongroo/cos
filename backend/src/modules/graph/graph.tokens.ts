// Graph Module DI tokens — kept in a leaf file (no imports of the module or
// service) so graph.service.ts and graph.module.ts can both reference the token
// without forming a circular import. A cycle here left NEO4J_DRIVER undefined at
// decoration time, breaking Nest DI ("can't resolve dependencies of GraphService").
export const NEO4J_DRIVER = 'NEO4J_DRIVER';
