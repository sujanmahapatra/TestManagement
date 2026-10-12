import {
  Box,
  Button,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

/**
 * A small data table. Each column name becomes a {{placeholder}} usable in
 * the free-text fields, and each row produces its own test case.
 *
 * Presentational: it reports the whole `parameters` object upward on every
 * change and holds no state of its own.
 */
export default function ParametersEditor({ parameters, error, disabled, onChange }) {
  const columns = parameters?.columns ?? [];
  const rows = parameters?.rows ?? [];

  const update = (next) => onChange({ columns, rows, ...next });

  const addColumn = () =>
    update({
      columns: [...columns, ''],
      // Keep every row the same width as the header, or the server rejects
      // the table as ragged.
      rows: rows.map((r) => [...r, '']),
    });

  const removeColumn = (index) =>
    update({
      columns: columns.filter((_, i) => i !== index),
      rows: rows.map((r) => r.filter((_, i) => i !== index)),
    });

  const renameColumn = (index, value) =>
    update({ columns: columns.map((c, i) => (i === index ? value : c)) });

  const addRow = () => update({ rows: [...rows, columns.map(() => '')] });
  const removeRow = (index) => update({ rows: rows.filter((_, i) => i !== index) });

  const setCell = (rowIndex, colIndex, value) =>
    update({
      rows: rows.map((r, i) => (i === rowIndex ? r.map((c, j) => (j === colIndex ? value : c)) : r)),
    });

  if (columns.length === 0) {
    return (
      <Stack spacing={1} alignItems="flex-start">
        <Typography variant="body2" color="text.secondary">
          Add a parameter to turn one note into several cases — reference it as{' '}
          <Box component="code" sx={{ fontFamily: 'monospace' }}>{'{{name}}'}</Box> in the fields
          above.
        </Typography>
        <Button size="small" onClick={addColumn} disabled={disabled}>
          Add parameter
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((column, i) => (
                <TableCell key={i} sx={{ minWidth: 140 }}>
                  <TextField
                    value={column}
                    onChange={(e) => renameColumn(i, e.target.value)}
                    placeholder="name"
                    size="small"
                    variant="standard"
                    disabled={disabled}
                    fullWidth
                  />
                </TableCell>
              ))}
              <TableCell align="right" sx={{ width: 48 }}>
                <IconButton size="small" onClick={addColumn} disabled={disabled} title="Add parameter">
                  +
                </IconButton>
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((value, colIndex) => (
                  <TableCell key={colIndex}>
                    <TextField
                      value={value}
                      onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
                      size="small"
                      variant="standard"
                      disabled={disabled}
                      fullWidth
                    />
                  </TableCell>
                ))}
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => removeRow(rowIndex)}
                    disabled={disabled}
                    title="Remove row"
                  >
                    ×
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" onClick={addRow} disabled={disabled}>
          Add row
        </Button>
        {columns.length > 0 && (
          <Button
            size="small"
            color="inherit"
            onClick={() => removeColumn(columns.length - 1)}
            disabled={disabled}
          >
            Remove last parameter
          </Button>
        )}
      </Stack>

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </Stack>
  );
}
