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
 * Supporting full internationalization.
 */
export interface GraphNode {
  id: string; // UUID for concepts, virtual ID for pages (e.g., "page_192")
  type: "KnowledgePoint" | "Topic" | "Page" | "Person" | "Event";

  raw_id?: string;
  name?: string; // Resolved name for current requested locale
  definition?: string; // Resolved definition for current requested locale
  name_en?: string;
  name_zh?: string;
  name_es?: string;
  name_fr?: string;
  name_ja?: string;
  name_de?: string;
  definition_en?: string;
  definition_zh?: string;
  definition_es?: string;
  definition_fr?: string;
  definition_ja?: string;
  definition_de?: string;
  aliases?: string[];
  grade?: string;
  publisher?: string;
  subject?: string;
  createdAt?: string;
  updatedAt?: string;

  // Page properties
  number?: number;

  [key: string]: any;
}

/**
 * Represents a relationship in the knowledge graph with full multilingual support.
 */
export interface GraphRelationship {
  id?: string;
  source: string; // Source node ID
  target: string; // Target node ID
  type: AllowedRelationshipType | string;
  label?: string; // Resolved label for current requested locale
  description?: string; // Resolved description for current requested locale
  label_zh?: string;
  label_en?: string;
  description_zh?: string;
  description_en?: string;
  createdAt?: string;
}

/**
 * Represents the subgraph data structure returned by the API.
 */
export interface KnowledgeGraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}
