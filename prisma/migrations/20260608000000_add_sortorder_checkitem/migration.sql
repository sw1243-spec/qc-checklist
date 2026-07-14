BEGIN TRY

BEGIN TRAN;

-- AlterTable: CheckItem 에 전역 표시 순서 컬럼 추가
ALTER TABLE [dbo].[CheckItem] ADD [sortOrder] INT NOT NULL CONSTRAINT [CheckItem_sortOrder_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- 기존 행 sortOrder 초기화: 템플릿별 no + id 순으로 0-based 번호 부여
-- EXEC 로 분리: ADD COLUMN 후 동일 배치에서 컬럼 참조 시 SQL Server 파싱 오류 방지
EXEC(N'
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY templateId ORDER BY [no] ASC, id ASC) - 1 AS rn
  FROM [dbo].[CheckItem]
)
UPDATE [dbo].[CheckItem]
SET sortOrder = ranked.rn
FROM ranked
WHERE [dbo].[CheckItem].id = ranked.id;
');
