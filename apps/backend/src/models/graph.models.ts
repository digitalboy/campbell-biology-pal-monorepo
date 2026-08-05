/**
 * Defines the allowed types for relationships in the knowledge graph.
 */
export type AllowedRelationshipType =
  | "IS_SUBTOPIC_OF"
  | "MENTIONED_ON_PAGE"
  | "IS_A"
  | "IS_PART_OF"
  | "IS_STEP_IN"
  | "CONTRASTS_WITH"
  | "CONSUMES"
  | "PRODUCES"
  | "REGULATES"
  | "LOCATION_OF"
  | "CONTRIBUTED_TO"
  | "PARTICIPATED_IN"
  | "LED_TO";

/**
 * Represents a node in the knowledge graph with a flattened structure.
 * This is the unified type for nodes returned by the API.
 */
export interface GraphNode {
  // Common properties
  id: string; // UUID for concepts, virtual ID for pages (e.g., "page_192")
  type: "KnowledgePoint" | "Topic" | "Page" | "Person" | "Event";

  // Concept properties (KnowledgePoint, Topic, etc.)
  raw_id?: string;
  name_en?: string;
  name_zh?: string;
  definition_en?: string;
  definition_zh?: string;
  description_en?: string;
  description_zh?: string;

  // Page properties
  number?: number;
  name?: string; // e.g., "page_192"

  // Allow other dynamic properties
  [key: string]: any;
}

/**
 * Represents a relationship in the knowledge graph with a flattened structure.
 */
export interface GraphRelationship {
  source: string; // Source node ID
  target: string; // Target node ID
  type: AllowedRelationshipType;
}

/**
 * Represents the subgraph data structure returned by the API.
 * This structure is consistent across all graph-related endpoints.
 */
export interface KnowledgeGraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}
