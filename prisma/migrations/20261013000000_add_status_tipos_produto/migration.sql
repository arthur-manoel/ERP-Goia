-- Preserva tipos usados em produtos, documentos e ordens antigas.
ALTER TABLE `tipos_produto`
  ADD COLUMN `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO';
