BEGIN TRY
BEGIN TRAN;

-- Submission 테이블에 3rd Shift 작업자 컬럼 추가
ALTER TABLE [dbo].[Submission] ADD [shift3LE] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[Submission] ADD [shift3QC] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[Submission] ADD [shift3SV] NVARCHAR(1000) NULL;

-- ShiftConfig: 3rd Shift 시드 (비활성 상태로 추가)
IF NOT EXISTS (SELECT 1 FROM [dbo].[ShiftConfig] WHERE [order] = 3)
BEGIN
  INSERT INTO [dbo].[ShiftConfig] ([name], [order], [endHour], [endMinute], [isActive])
  VALUES (N'3rd Shift', 3, 6, 0, 0);
END

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 BEGIN ROLLBACK TRAN; END;
THROW
END CATCH
