BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Company] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [Company_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Company_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Line] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [Line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Line_companyId_code_key] UNIQUE NONCLUSTERED ([companyId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Model] (
    [id] INT NOT NULL IDENTITY(1,1),
    [lineId] INT NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [Model_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ChecksheetTemplate] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [version] NVARCHAR(1000) NOT NULL,
    [excelFile] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [ChecksheetTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ChecksheetTemplate_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[TemplateModel] (
    [templateId] INT NOT NULL,
    [modelId] INT NOT NULL,
    CONSTRAINT [TemplateModel_pkey] PRIMARY KEY CLUSTERED ([templateId],[modelId])
);

-- CreateTable
CREATE TABLE [dbo].[CheckItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [templateId] INT NOT NULL,
    [section] NVARCHAR(1000) NOT NULL,
    [opNo] NVARCHAR(1000),
    [no] INT NOT NULL,
    [characteristic] NVARCHAR(1000) NOT NULL,
    [method] NVARCHAR(1000),
    [sample] NVARCHAR(1000),
    [inputType] NVARCHAR(1000) NOT NULL,
    [unit] NVARCHAR(1000),
    [nullable] BIT NOT NULL CONSTRAINT [CheckItem_nullable_df] DEFAULT 0,
    CONSTRAINT [CheckItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SpecRange] (
    [id] INT NOT NULL IDENTITY(1,1),
    [itemId] INT NOT NULL,
    [lineId] INT,
    [modelId] INT,
    [minVal] FLOAT(53),
    [maxVal] FLOAT(53),
    [label] NVARCHAR(1000),
    CONSTRAINT [SpecRange_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Submission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [templateId] INT NOT NULL,
    [lineId] INT NOT NULL,
    [modelId] INT NOT NULL,
    [date] DATETIME2 NOT NULL,
    [shift1Signer] NVARCHAR(1000),
    [shift2Signer] NVARCHAR(1000),
    [supervisor] NVARCHAR(1000),
    [inspector] NVARCHAR(1000),
    [partNumberBuild] NVARCHAR(1000),
    [hasOutOfRange] BIT NOT NULL CONSTRAINT [Submission_hasOutOfRange_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Submission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Submission_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CheckValue] (
    [id] INT NOT NULL IDENTITY(1,1),
    [submissionId] INT NOT NULL,
    [itemId] INT NOT NULL,
    [shift] INT NOT NULL,
    [partNo] INT NOT NULL,
    [valueText] NVARCHAR(1000),
    [isOutOfRange] BIT NOT NULL CONSTRAINT [CheckValue_isOutOfRange_df] DEFAULT 0,
    CONSTRAINT [CheckValue_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Line] ADD CONSTRAINT [Line_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[Company]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Model] ADD CONSTRAINT [Model_lineId_fkey] FOREIGN KEY ([lineId]) REFERENCES [dbo].[Line]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TemplateModel] ADD CONSTRAINT [TemplateModel_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[ChecksheetTemplate]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TemplateModel] ADD CONSTRAINT [TemplateModel_modelId_fkey] FOREIGN KEY ([modelId]) REFERENCES [dbo].[Model]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CheckItem] ADD CONSTRAINT [CheckItem_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[ChecksheetTemplate]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SpecRange] ADD CONSTRAINT [SpecRange_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[CheckItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SpecRange] ADD CONSTRAINT [SpecRange_lineId_fkey] FOREIGN KEY ([lineId]) REFERENCES [dbo].[Line]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SpecRange] ADD CONSTRAINT [SpecRange_modelId_fkey] FOREIGN KEY ([modelId]) REFERENCES [dbo].[Model]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Submission] ADD CONSTRAINT [Submission_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[ChecksheetTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Submission] ADD CONSTRAINT [Submission_lineId_fkey] FOREIGN KEY ([lineId]) REFERENCES [dbo].[Line]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Submission] ADD CONSTRAINT [Submission_modelId_fkey] FOREIGN KEY ([modelId]) REFERENCES [dbo].[Model]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CheckValue] ADD CONSTRAINT [CheckValue_submissionId_fkey] FOREIGN KEY ([submissionId]) REFERENCES [dbo].[Submission]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CheckValue] ADD CONSTRAINT [CheckValue_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[CheckItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
