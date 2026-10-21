-- Preserva a tabela existente e seus IDs inteiros. NULL indica token não rotacionado.
ALTER TABLE `refresh_tokens` ADD COLUMN `replaced_by` INTEGER NULL;
