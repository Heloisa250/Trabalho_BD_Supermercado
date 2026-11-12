-- Execute o arquivo inteiro em uma conexão nova com a base acadêmica.
SET @demo_f0001 = NULL, @demo_f0002 = NULL, @demo_total = NULL,
    @demo_erros_inicio = NULL,
    @demo_erros_trava = NULL, @demo_erros_contagem = NULL,
    @demo_erros_update = NULL, @demo_valido = 0, @demo_confirmar = 0;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;
GET DIAGNOSTICS @demo_erros_inicio = NUMBER;

-- Trava os registros e as lacunas das matrículas no índice único.
SELECT matricula
FROM Supermercado.funcionario
WHERE matricula IN ('F0001', 'F0002')
FOR UPDATE;
GET DIAGNOSTICS @demo_erros_trava = NUMBER;

SELECT COUNT(CASE WHEN CAST(matricula AS BINARY) = 'F0001' THEN 1 END),
       COUNT(CASE WHEN CAST(matricula AS BINARY) = 'F0002' THEN 1 END),
       COUNT(*)
INTO @demo_f0001, @demo_f0002, @demo_total
FROM Supermercado.funcionario
WHERE matricula IN ('F0001', 'F0002');
GET DIAGNOSTICS @demo_erros_contagem = NUMBER;

SET @demo_valido = (@demo_erros_inicio = 0 AND @demo_erros_trava = 0 AND @demo_erros_contagem = 0
    AND @demo_f0001 = 1 AND @demo_f0002 = 1 AND @demo_total = 2);

UPDATE Supermercado.funcionario
SET senha_hash = CASE matricula
    WHEN 'F0001' THEN '$2b$12$eV2TsuK7y/nstz41HDjtd.7nNcoj5YAR8f24aHocoTUPz1erPM4tW'
    WHEN 'F0002' THEN '$2b$12$lu43EezpldVhkI7U5pAB8e3gbOwLzO5bQJVFcBYEOfFMzFB1nHyyi'
END
WHERE @demo_valido AND matricula IN ('F0001', 'F0002');
GET DIAGNOSTICS @demo_erros_update = NUMBER;

SET @demo_confirmar = (@demo_valido AND @demo_erros_update = 0);
SET @demo_finalizar = IF(@demo_confirmar, 'COMMIT AND NO CHAIN NO RELEASE', 'DO 0');
PREPARE finalizar_credenciais_demo FROM @demo_finalizar;
EXECUTE finalizar_credenciais_demo;
DEALLOCATE PREPARE finalizar_credenciais_demo;
-- No caminho DO 0, a transação continua aberta e é revertida aqui.
ROLLBACK AND NO CHAIN NO RELEASE;

SELECT IF(@demo_confirmar,
    'OK: credenciais acadêmicas configuradas.',
    'ROLLBACK: confira as ocorrências de F0001 e F0002 e os erros do MySQL.'
) AS resultado;
SET @demo_f0001 = NULL, @demo_f0002 = NULL, @demo_total = NULL,
    @demo_erros_inicio = NULL,
    @demo_erros_trava = NULL, @demo_erros_contagem = NULL,
    @demo_erros_update = NULL, @demo_valido = NULL,
    @demo_confirmar = NULL, @demo_finalizar = NULL;
