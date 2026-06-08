EXEC sp_rename 'Submission.lineId',      'line',     'COLUMN';
EXEC sp_rename 'Submission.modelId',     'model',    'COLUMN';
EXEC sp_rename 'Submission.shift1Signer','shift1LE', 'COLUMN';
EXEC sp_rename 'Submission.shift2Signer','shift2LE', 'COLUMN';
EXEC sp_rename 'Submission.supervisor',  'shift1QC', 'COLUMN';
EXEC sp_rename 'Submission.inspector',   'shift2QC', 'COLUMN';
