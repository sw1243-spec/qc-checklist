BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[ShiftConfig] (
    [id]        INT            IDENTITY(1,1) NOT NULL,
    [name]      NVARCHAR(1000) NOT NULL,
    [order]     INT            NOT NULL,
    [endHour]   INT            NOT NULL,
    [endMinute] INT            NOT NULL,
    [isActive]  BIT            NOT NULL CONSTRAINT [ShiftConfig_isActive_df] DEFAULT 1,
    CONSTRAINT [ShiftConfig_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ShiftConfig_order_key] UNIQUE NONCLUSTERED ([order])
);

-- 기본 2개 시프트 시드 (기존 데이터와 호환)
INSERT INTO [dbo].[ShiftConfig] ([name], [order], [endHour], [endMinute], [isActive])
VALUES (N'1st Shift', 1, 14, 0, 1),
       (N'2nd Shift', 2, 22, 0, 1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
