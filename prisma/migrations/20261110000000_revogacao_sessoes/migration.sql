-- Credenciais anteriores à implantação ficam sem identidade de sessão.
ALTER TABLE `refresh_tokens`
    ADD COLUMN `sessao_id` CHAR(36) NULL,
    ADD INDEX `idx_refresh_sessao` (`sessao_id`, `id_usuario`, `revogado`);
