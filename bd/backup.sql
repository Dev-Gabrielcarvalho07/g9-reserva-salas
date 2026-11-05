-- =====================================================================
-- G9 - SISTEMA DE RESERVA DE SALAS DE REUNIÃO
-- backup.sql: carga inicial (DDL + DML + Functions + Procedure + Triggers
--             + Views + Roles + Seeds). Executado automaticamente pelo
--             container do Postgres na PRIMEIRA subida (volume vazio).
-- Banco: g9_reservas (criado pela variável POSTGRES_DB do compose)
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- 1. EXTENSÕES
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt()/gen_salt() para hash de senha

-- ---------------------------------------------------------------------
-- 2. HARDENING DO SCHEMA PUBLIC
--    Ninguém (PUBLIC) pode criar objetos ou usar o schema public.
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE g9_reservas FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 3. SCHEMAS (organização lógica)
--    reserva   -> negócio (salas, recursos, reservas)
--    seguranca -> operadores do sistema (login)
--    audit     -> trilha de auditoria
-- ---------------------------------------------------------------------
CREATE SCHEMA reserva;
CREATE SCHEMA seguranca;
CREATE SCHEMA audit;

-- ---------------------------------------------------------------------
-- 4. TABELAS
-- ---------------------------------------------------------------------
CREATE TABLE seguranca.operador (
    id          BIGSERIAL    PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    login       VARCHAR(50)  NOT NULL UNIQUE,
    senha_hash  TEXT         NOT NULL,                       -- bcrypt via pgcrypto
    perfil      VARCHAR(20)  NOT NULL DEFAULT 'OPERADOR'
                CHECK (perfil IN ('ADMIN', 'OPERADOR')),
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE reserva.sala (
    id           BIGSERIAL    PRIMARY KEY,
    nome         VARCHAR(80)  NOT NULL UNIQUE,
    capacidade   INTEGER      NOT NULL CHECK (capacidade > 0),
    localizacao  VARCHAR(120),
    ativa        BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE reserva.recurso (
    id         BIGSERIAL    PRIMARY KEY,
    sala_id    BIGINT       NOT NULL REFERENCES reserva.sala(id) ON DELETE CASCADE,
    nome       VARCHAR(80)  NOT NULL,          -- ex: Projetor, TV 55", Webcam
    descricao  VARCHAR(200)
);

CREATE TABLE reserva.reserva (
    id           BIGSERIAL    PRIMARY KEY,
    sala_id      BIGINT       NOT NULL REFERENCES reserva.sala(id),
    titulo       VARCHAR(120) NOT NULL,
    responsavel  VARCHAR(100) NOT NULL,
    inicio       TIMESTAMP    NOT NULL,
    fim          TIMESTAMP    NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'ATIVA'
                 CHECK (status IN ('ATIVA', 'CANCELADA')),
    criado_por   BIGINT       REFERENCES seguranca.operador(id),
    criado_em    TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT ck_reserva_periodo CHECK (fim > inicio)
);

CREATE INDEX idx_reserva_sala_periodo ON reserva.reserva (sala_id, inicio, fim)
    WHERE status = 'ATIVA';

CREATE TABLE audit.log_alteracao (
    id              BIGSERIAL    PRIMARY KEY,
    tabela          TEXT         NOT NULL,
    operacao        TEXT         NOT NULL,           -- INSERT / UPDATE / DELETE
    registro_id     BIGINT,
    dados_antigos   JSONB,
    dados_novos     JSONB,
    usuario_db      TEXT         NOT NULL DEFAULT current_user,
    operador_app    TEXT,                            -- login do operador (vem do backend)
    data_hora       TIMESTAMP    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. FUNCTIONS
-- ---------------------------------------------------------------------

-- 5.1 Verifica se a sala está livre no período (ignora uma reserva, útil na edição)
CREATE OR REPLACE FUNCTION reserva.fn_sala_disponivel(
    p_sala_id            BIGINT,
    p_inicio             TIMESTAMP,
    p_fim                TIMESTAMP,
    p_ignorar_reserva_id BIGINT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT NOT EXISTS (
        SELECT 1
          FROM reserva.reserva r
         WHERE r.sala_id = p_sala_id
           AND r.status  = 'ATIVA'
           AND r.id IS DISTINCT FROM p_ignorar_reserva_id
           AND r.inicio < p_fim          -- sobreposição de intervalos:
           AND r.fim    > p_inicio       -- (A.inicio < B.fim) e (A.fim > B.inicio)
    );
$$;

-- 5.2 Autenticação do operador com pgcrypto (a senha nunca sai do banco)
--     SECURITY DEFINER: roda com permissão do dono, então a aplicação
--     NÃO precisa (nem pode) ler a coluna senha_hash.
CREATE OR REPLACE FUNCTION seguranca.fn_autenticar(p_login TEXT, p_senha TEXT)
RETURNS TABLE (id BIGINT, nome VARCHAR, login VARCHAR, perfil VARCHAR)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = seguranca, public
AS $$
    SELECT o.id, o.nome, o.login, o.perfil
      FROM seguranca.operador o
     WHERE o.login = p_login
       AND o.ativo
       AND o.senha_hash = public.crypt(p_senha, o.senha_hash);
$$;

-- ---------------------------------------------------------------------
-- 6. PROCEDURE COM CONTROLE DE CONCORRÊNCIA (SELECT ... FOR UPDATE)
--    Trava a LINHA da sala: duas reservas simultâneas para a mesma sala
--    são executadas em fila. A segunda espera a primeira terminar e,
--    ao reler, encontra o conflito -> erro. Salas diferentes não se travam.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE reserva.sp_reservar_sala(
    p_sala_id      BIGINT,
    p_titulo       VARCHAR,
    p_responsavel  VARCHAR,
    p_inicio       TIMESTAMP,
    p_fim          TIMESTAMP,
    p_operador_id  BIGINT,
    INOUT p_reserva_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ativa BOOLEAN;
BEGIN
    IF p_fim <= p_inicio THEN
        RAISE EXCEPTION 'Horário inválido: o fim deve ser depois do início'
              USING ERRCODE = 'check_violation';
    END IF;

    IF p_inicio < now()::timestamp THEN
        RAISE EXCEPTION 'Não é possível reservar um horário no passado'
              USING ERRCODE = 'check_violation';
    END IF;

    -- LOCK pessimista na linha da sala
    SELECT s.ativa INTO v_ativa
      FROM reserva.sala s
     WHERE s.id = p_sala_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sala % não encontrada', p_sala_id
              USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT v_ativa THEN
        RAISE EXCEPTION 'Sala % está inativa', p_sala_id
              USING ERRCODE = 'check_violation';
    END IF;

    IF NOT reserva.fn_sala_disponivel(p_sala_id, p_inicio, p_fim) THEN
        RAISE EXCEPTION 'Sala já reservada nesse horário'
              USING ERRCODE = 'exclusion_violation';
    END IF;

    INSERT INTO reserva.reserva (sala_id, titulo, responsavel, inicio, fim, criado_por)
    VALUES (p_sala_id, p_titulo, p_responsavel, p_inicio, p_fim, p_operador_id)
    RETURNING id INTO p_reserva_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------

-- 7.1 Validação: impede choque de horário mesmo em INSERT/UPDATE diretos
--     (ex: edição de reserva pela API ou alguém no psql)
CREATE OR REPLACE FUNCTION reserva.fn_trg_valida_reserva()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Mesmo lock da procedure: garante fila por sala em QUALQUER caminho de escrita
    PERFORM 1 FROM reserva.sala WHERE id = NEW.sala_id FOR UPDATE;

    -- Na edição, não deixa mover a reserva para o passado
    -- (no INSERT a regra fica na procedure, para os seeds poderem ter reservas de hoje cedo)
    IF TG_OP = 'UPDATE'
       AND (NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim)
       AND NEW.inicio < now()::timestamp THEN
        RAISE EXCEPTION 'Não é possível mover a reserva para um horário no passado'
              USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'ATIVA'
       AND NOT reserva.fn_sala_disponivel(NEW.sala_id, NEW.inicio, NEW.fim, NEW.id) THEN
        RAISE EXCEPTION 'Sala já reservada nesse horário'
              USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_valida_reserva
BEFORE INSERT OR UPDATE ON reserva.reserva
FOR EACH ROW EXECUTE FUNCTION reserva.fn_trg_valida_reserva();

-- 7.2 Auditoria genérica: grava antes/depois em JSON
--     SECURITY DEFINER: a aplicação não tem INSERT no schema audit,
--     então ninguém consegue forjar ou apagar log pela API.
CREATE OR REPLACE FUNCTION audit.fn_registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public
AS $$
BEGIN
    INSERT INTO audit.log_alteracao
        (tabela, operacao, registro_id, dados_antigos, dados_novos, usuario_db, operador_app)
    VALUES (
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
        session_user,
        NULLIF(current_setting('app.operador', true), '')   -- setado pelo backend
    );
    RETURN NULL;   -- AFTER trigger: retorno ignorado
END;
$$;

CREATE TRIGGER trg_audit_reserva
AFTER INSERT OR UPDATE OR DELETE ON reserva.reserva
FOR EACH ROW EXECUTE FUNCTION audit.fn_registrar_auditoria();

CREATE TRIGGER trg_audit_sala
AFTER INSERT OR UPDATE OR DELETE ON reserva.sala
FOR EACH ROW EXECUTE FUNCTION audit.fn_registrar_auditoria();

CREATE TRIGGER trg_audit_recurso
AFTER INSERT OR UPDATE OR DELETE ON reserva.recurso
FOR EACH ROW EXECUTE FUNCTION audit.fn_registrar_auditoria();

-- ---------------------------------------------------------------------
-- 8. VIEWS
-- ---------------------------------------------------------------------

-- 8.1 Reservas ativas de hoje
CREATE OR REPLACE VIEW reserva.vw_reservas_hoje AS
SELECT r.id,
       s.nome  AS sala,
       r.titulo,
       r.responsavel,
       r.inicio,
       r.fim
  FROM reserva.reserva r
  JOIN reserva.sala s ON s.id = r.sala_id
 WHERE r.status = 'ATIVA'
   AND r.inicio::date = CURRENT_DATE
 ORDER BY r.inicio;

-- 8.2 Situação das salas neste exato momento
CREATE OR REPLACE VIEW reserva.vw_salas_livres_agora AS
SELECT s.id,
       s.nome,
       s.capacidade,
       s.localizacao,
       r.titulo AS reuniao_atual,
       r.fim    AS ocupada_ate,
       CASE WHEN r.id IS NULL THEN 'LIVRE' ELSE 'OCUPADA' END AS situacao
  FROM reserva.sala s
  LEFT JOIN reserva.reserva r
         ON r.sala_id = s.id
        AND r.status  = 'ATIVA'
        AND now()::timestamp >= r.inicio
        AND now()::timestamp <  r.fim
 WHERE s.ativa
 ORDER BY s.nome;

-- ---------------------------------------------------------------------
-- 9. ROLES E USUÁRIOS (RBAC)
--    rl_leitor   -> somente leitura (relatórios/consultas)
--    rl_escritor -> herda leitura + escrita + execução de rotinas
-- ---------------------------------------------------------------------
CREATE ROLE rl_leitor   NOLOGIN;
CREATE ROLE rl_escritor NOLOGIN IN ROLE rl_leitor;

CREATE ROLE app_user       LOGIN PASSWORD 'App@G9_2026'       IN ROLE rl_escritor;
CREATE ROLE relatorio_user LOGIN PASSWORD 'Relatorio@G9_2026' IN ROLE rl_leitor;

-- Timeouts por usuário (sobrepõem o postgresql.conf)
ALTER ROLE app_user       SET statement_timeout = '5s';
ALTER ROLE relatorio_user SET statement_timeout = '3s';
ALTER ROLE relatorio_user SET default_transaction_read_only = on;

-- Conexão ao banco
GRANT CONNECT ON DATABASE g9_reservas TO rl_leitor;

-- Leitura: schema reserva
GRANT USAGE  ON SCHEMA reserva TO rl_leitor;
GRANT SELECT ON ALL TABLES IN SCHEMA reserva TO rl_leitor;   -- inclui as views

-- Escrita: schema reserva
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA reserva TO rl_escritor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reserva TO rl_escritor;

-- Rotinas: ninguém executa por padrão, só quem recebe GRANT
REVOKE EXECUTE ON ALL FUNCTIONS  IN SCHEMA reserva, seguranca, audit FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA reserva FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION  reserva.fn_sala_disponivel(BIGINT, TIMESTAMP, TIMESTAMP, BIGINT) TO rl_leitor;
GRANT  EXECUTE ON FUNCTION  reserva.fn_trg_valida_reserva() TO rl_escritor;
GRANT  EXECUTE ON FUNCTION  audit.fn_registrar_auditoria()  TO rl_escritor;
GRANT  EXECUTE ON PROCEDURE reserva.sp_reservar_sala(BIGINT, VARCHAR, VARCHAR, TIMESTAMP, TIMESTAMP, BIGINT, BIGINT) TO rl_escritor;

-- Segurança: a aplicação NÃO lê a tabela de operadores (nem o hash).
-- Só pode chamar a função de autenticação.
GRANT USAGE   ON SCHEMA seguranca TO rl_escritor;
GRANT EXECUTE ON FUNCTION seguranca.fn_autenticar(TEXT, TEXT) TO rl_escritor;

-- Auditoria: somente leitura (ninguém altera ou apaga log pela aplicação)
GRANT USAGE  ON SCHEMA audit TO rl_escritor;
GRANT SELECT ON audit.log_alteracao TO rl_escritor;

-- ---------------------------------------------------------------------
-- 10. SEEDS (dados iniciais)
-- ---------------------------------------------------------------------

-- Operadores pré-cadastrados (senha com bcrypt via pgcrypto)
INSERT INTO seguranca.operador (nome, login, senha_hash, perfil) VALUES
  ('Administrador',  'admin',    crypt('admin123',    gen_salt('bf')), 'ADMIN'),
  ('Operador Padrão','operador', crypt('operador123', gen_salt('bf')), 'OPERADOR');

INSERT INTO reserva.sala (nome, capacidade, localizacao) VALUES
  ('Sala Atlântico', 12, 'Bloco A - 1º andar'),
  ('Sala Pacífico',   8, 'Bloco A - 2º andar'),
  ('Sala Índico',    20, 'Bloco B - Térreo'),
  ('Auditório',      60, 'Bloco C - Térreo');

INSERT INTO reserva.recurso (sala_id, nome, descricao) VALUES
  (1, 'Projetor',   'Epson Full HD'),
  (1, 'Webcam',     'Logitech 1080p'),
  (2, 'TV 55"',     'Smart TV com HDMI'),
  (3, 'Projetor',   'BenQ 4K'),
  (3, 'Quadro branco', NULL),
  (4, 'Sistema de som', 'Microfones sem fio'),
  (4, 'Projetor',   'Laser 4K');

-- Reservas de exemplo (relativas à data atual, para as views terem dados)
INSERT INTO reserva.reserva (sala_id, titulo, responsavel, inicio, fim, criado_por) VALUES
  (1, 'Daily do time de TI',     'Ana Souza',
      CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '09:30', 1),
  (2, 'Entrevista candidato',    'Carlos Lima',
      CURRENT_DATE + TIME '14:00', CURRENT_DATE + TIME '15:00', 2),
  (3, 'Treinamento de segurança','Juliana Reis',
      CURRENT_DATE + 1 + TIME '08:00', CURRENT_DATE + 1 + TIME '12:00', 1),
  (4, 'Reunião geral',           'Diretoria',
      date_trunc('hour', now())::timestamp, date_trunc('hour', now())::timestamp + INTERVAL '2 hours', 1);

-- Limpa o log gerado pelos seeds (auditoria começa "zerada" na demo)
TRUNCATE audit.log_alteracao RESTART IDENTITY;
