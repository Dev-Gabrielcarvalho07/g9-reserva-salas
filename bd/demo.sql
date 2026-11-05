-- =====================================================================
-- G9 - ROTEIRO DE DEMONSTRAÇÃO DOS RECURSOS DO BANCO
-- Abrir o psql como administrador (via socket local do container):
--   docker exec -it -e PGPASSWORD=Postgres@G9_2026 g9-db psql -U postgres -d g9_reservas
-- Para a demo de concorrência, abrir DOIS terminais com o comando acima.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONFIGURAÇÕES (postgresql.conf + ALTER ROLE)
-- ---------------------------------------------------------------------
SHOW statement_timeout;                      -- 15s (global)
SHOW idle_in_transaction_session_timeout;    -- 20s
SHOW password_encryption;                    -- scram-sha-256
SHOW hba_file;                               -- /etc/postgresql/pg_hba.conf

-- Timeouts específicos por usuário
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('app_user', 'relatorio_user');

-- Senhas dos usuários do banco gravadas em SCRAM
SELECT rolname, left(rolpassword, 14) AS formato FROM pg_authid WHERE rolname IN ('app_user', 'relatorio_user');

-- ---------------------------------------------------------------------
-- 2. SCHEMAS, ROLES E PERMISSÕES
-- ---------------------------------------------------------------------
\dn
\du

-- O usuário de relatório só lê
SET ROLE relatorio_user;
SELECT nome, capacidade FROM reserva.sala;                        -- OK
INSERT INTO reserva.sala (nome, capacidade) VALUES ('Hack', 1);   -- ERRO: permission denied
RESET ROLE;

-- A aplicação não consegue ler a tabela de operadores (nem o hash)
SET ROLE app_user;
SELECT * FROM seguranca.operador;                                 -- ERRO: permission denied
SELECT * FROM seguranca.fn_autenticar('admin', 'admin123');       -- OK: só via function
CREATE TABLE public.teste (id int);                               -- ERRO: schema public bloqueado
RESET ROLE;

-- ---------------------------------------------------------------------
-- 3. PGCRYPTO: senhas dos operadores com bcrypt
-- ---------------------------------------------------------------------
SELECT login, senha_hash FROM seguranca.operador;
SELECT login, senha_hash = crypt('admin123', senha_hash) AS senha_confere FROM seguranca.operador;

-- ---------------------------------------------------------------------
-- 4. FUNCTION E VIEWS
-- ---------------------------------------------------------------------
SELECT reserva.fn_sala_disponivel(2, CURRENT_DATE + TIME '14:30', CURRENT_DATE + TIME '15:30');  -- false
SELECT reserva.fn_sala_disponivel(2, CURRENT_DATE + TIME '18:00', CURRENT_DATE + TIME '19:00');  -- true

SELECT * FROM reserva.vw_salas_livres_agora;
SELECT * FROM reserva.vw_reservas_hoje;

-- ---------------------------------------------------------------------
-- 5. TRIGGER DE VALIDAÇÃO (choque de horário mesmo sem a procedure)
-- ---------------------------------------------------------------------
INSERT INTO reserva.reserva (sala_id, titulo, responsavel, inicio, fim)
VALUES (2, 'Invasora', 'Teste', CURRENT_DATE + TIME '14:30', CURRENT_DATE + TIME '15:30');
-- ERRO: Sala já reservada nesse horário

-- ---------------------------------------------------------------------
-- 6. PROCEDURE + CONCORRÊNCIA (SELECT ... FOR UPDATE)  -> DOIS TERMINAIS
-- ---------------------------------------------------------------------
-- TERMINAL A:
BEGIN;
CALL reserva.sp_reservar_sala(3, 'Reunião A', 'Terminal A',
     CURRENT_DATE + 3 + TIME '10:00', CURRENT_DATE + 3 + TIME '11:00', 1, NULL);
--   (NÃO dar COMMIT ainda: a linha da sala 3 está travada)

-- TERMINAL B (fica "parado", esperando o lock):
CALL reserva.sp_reservar_sala(3, 'Reunião B', 'Terminal B',
     CURRENT_DATE + 3 + TIME '10:30', CURRENT_DATE + 3 + TIME '11:30', 1, NULL);

-- TERMINAL A (em até 10s, por causa do lock_timeout):
COMMIT;
--   -> Terminal B destrava e recebe: ERRO "Sala já reservada nesse horário"

-- Ver quem está travando quem (rodar no B enquanto espera, ou num 3º terminal):
SELECT pid, state, wait_event_type, left(query, 60) AS query
  FROM pg_stat_activity WHERE datname = 'g9_reservas' AND pid <> pg_backend_pid();

-- ---------------------------------------------------------------------
-- 7. idle_in_transaction_session_timeout (20s)
-- ---------------------------------------------------------------------
BEGIN;
SELECT now();
--   ... esperar 20 segundos sem fazer nada ...
SELECT now();
--   -> FATAL: terminating connection due to idle-in-transaction timeout
--   (o psql reconecta sozinho; a transação abandonada foi desfeita)

-- ---------------------------------------------------------------------
-- 8. statement_timeout
-- ---------------------------------------------------------------------
SELECT pg_sleep(20);          -- como postgres: cancelado em 15s (valor global)
-- Para o app_user (5s), o ALTER ROLE só vale num LOGIN real (SET ROLE não aplica).
-- Use o botão do Painel na SPA, ou no PowerShell:
--   docker exec -it -e PGPASSWORD=App@G9_2026 g9-pgbouncer psql -h 127.0.0.1 -p 6432 -U app_user -d g9_reservas -c "SELECT pg_sleep(7);"

-- ---------------------------------------------------------------------
-- 9. AUDITORIA (trigger audit.fn_registrar_auditoria)
-- ---------------------------------------------------------------------
SELECT id, tabela, operacao, registro_id, usuario_db, operador_app, data_hora
  FROM audit.log_alteracao ORDER BY id DESC LIMIT 10;

SELECT dados_antigos ->> 'status' AS antes, dados_novos ->> 'status' AS depois
  FROM audit.log_alteracao WHERE operacao = 'UPDATE' ORDER BY id DESC LIMIT 5;

-- A aplicação não consegue apagar log
SET ROLE app_user;
DELETE FROM audit.log_alteracao;  -- ERRO: permission denied
RESET ROLE;

-- =====================================================================
-- COMANDOS FORA DO PSQL (PowerShell)
-- =====================================================================
-- PgBouncer: estatísticas do pool
--   docker exec -it -e PGPASSWORD=Admin@Pool_2026 g9-pgbouncer psql -h 127.0.0.1 -p 6432 -U pgbouncer_admin -d pgbouncer -c "SHOW POOLS;"
--
-- pg_hba.conf: conexão de um IP NÃO autorizado é recusada
--   docker run --rm -it --network g9-reserva-salas_g9_net -e PGPASSWORD=App@G9_2026 postgres:16-alpine psql -h db -U app_user -d g9_reservas
--   -> FATAL: pg_hba.conf rejects connection for host "172.28.0.x"
--
-- pg_hba.conf: superusuário pela rede é recusado (mesmo vindo do IP liberado)
--   docker exec -it -e PGPASSWORD=Postgres@G9_2026 g9-pgbouncer psql -h db -U postgres -d g9_reservas
--
-- Logs do Postgres (conexões, DDL, locks, queries lentas)
--   docker compose logs db --tail 30
