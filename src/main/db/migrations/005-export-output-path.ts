export const migration005ExportOutputPath = `
ALTER TABLE export_compositions
ADD COLUMN output_file_path TEXT;
`;
