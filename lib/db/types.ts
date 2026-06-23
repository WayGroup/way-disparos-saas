export type BrandBlock = {
  id: string;
  block_key: string;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string;
};

export type Community = {
  id: string;
  name: string;
  identifier: string;
  sort_order: number;
  created_at: string;
};

export type Asset = {
  id: string;
  filename: string;
  storage_path: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
