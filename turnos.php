<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// Configuración local. No usa servicios externos.
define('DEFAULT_CLASS_NAME', 'Nombre de la clase');
define('MAX_HISTORY_ITEMS', 1000);

$dbFile = __DIR__ . '/../data/turnos_db.txt';

try {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput ?: '{}', true);

    if (!is_array($input)) {
        $input = array();
    }

    $action = isset($input['action']) ? trim((string)$input['action']) : 'getState';

    if ($action === 'health') {
        jsonResponse(array(
            'ok' => true,
            'database' => 'txt',
            'file' => 'data/turnos_db.txt',
            'phpVersion' => PHP_VERSION
        ));
    }

    if ($action === 'getState') {
        $response = withDatabaseLock($dbFile, false, function ($db) {
            return makeStateResponse($db, null);
        });

        jsonResponse($response);
    }

    $response = withDatabaseLock($dbFile, true, function ($db) use ($action, $input) {
        if ($action === 'setClassName') {
            $className = sanitizeClassName(isset($input['className']) ? $input['className'] : '');

            if ($className === '') {
                throw new AppError('Nombre de clase no válido', 400);
            }

            getOrCreateClass($db, $className);
            $db['activeClass'] = $className;
            addHistory($db, $className, null, 'change_class');

            return array($db, makeStateResponse($db, null));
        }

        if ($action === 'requestTurn') {
            $groupNumber = sanitizeGroupNumber(isset($input['groupNumber']) ? $input['groupNumber'] : '');

            if ($groupNumber === '') {
                throw new AppError('Grupo no válido', 400);
            }

            $className = getActiveClass($db);
            $classData =& getOrCreateClass($db, $className);

            $newQueue = array();
            foreach ($classData['queue'] as $group) {
                if ((string)$group !== $groupNumber) {
                    $newQueue[] = (string)$group;
                }
            }

            $newQueue[] = $groupNumber;
            $classData['queue'] = $newQueue;
            $classData['updatedAt'] = nowIso();

            addHistory($db, $className, $groupNumber, 'request_turn');

            return array($db, makeStateResponse($db, $groupNumber));
        }

        if ($action === 'nextGroup') {
            $className = getActiveClass($db);
            $classData =& getOrCreateClass($db, $className);

            $removedGroup = null;
            if (count($classData['queue']) > 0) {
                $removedGroup = (string)array_shift($classData['queue']);
            }

            $classData['updatedAt'] = nowIso();
            addHistory($db, $className, $removedGroup, 'next_group');

            return array($db, makeStateResponse($db, $removedGroup));
        }

        if ($action === 'deleteTurns') {
            $className = getActiveClass($db);
            $classData =& getOrCreateClass($db, $className);

            $classData['queue'] = array();
            $classData['updatedAt'] = nowIso();
            addHistory($db, $className, null, 'delete_turns');

            return array($db, makeStateResponse($db, null));
        }

        throw new AppError('Acción no reconocida', 400);
    });

    jsonResponse($response);
} catch (AppError $error) {
    errorResponse($error->getMessage(), $error->getStatusCode());
} catch (Exception $error) {
    errorResponse('Error interno: ' . $error->getMessage(), 500);
}

class AppError extends Exception
{
    private $statusCode;

    public function __construct($message, $statusCode)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }

    public function getStatusCode()
    {
        return $this->statusCode;
    }
}

function withDatabaseLock($file, $write, $callback)
{
    ensureDatabaseExists($file);

    $handle = fopen($file, 'c+');
    if (!$handle) {
        throw new AppError('No se pudo abrir la base de datos TXT', 500);
    }

    $lockType = $write ? LOCK_EX : LOCK_SH;

    if (!flock($handle, $lockType)) {
        fclose($handle);
        throw new AppError('No se pudo bloquear la base de datos TXT', 500);
    }

    try {
        rewind($handle);
        $contents = stream_get_contents($handle);
        $db = decodeDatabase($contents);

        $result = $callback($db);

        if ($write) {
            if (is_array($result) && count($result) === 2) {
                $db = $result[0];
                $response = $result[1];
            } else {
                $response = $result;
            }

            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, json_encode(normalizeDatabase($db), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            fflush($handle);

            return $response;
        }

        return $result;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function ensureDatabaseExists($file)
{
    $dir = dirname($file);

    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    if (!file_exists($file)) {
        file_put_contents($file, json_encode(createEmptyDatabase(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
}

function decodeDatabase($contents)
{
    $contents = trim((string)$contents);

    if ($contents === '') {
        return createEmptyDatabase();
    }

    $db = json_decode($contents, true);

    if (!is_array($db)) {
        return createEmptyDatabase();
    }

    return normalizeDatabase($db);
}

function createEmptyDatabase()
{
    $now = nowIso();

    return array(
        'activeClass' => DEFAULT_CLASS_NAME,
        'classes' => array(
            DEFAULT_CLASS_NAME => array(
                'queue' => array(),
                'updatedAt' => $now
            )
        ),
        'history' => array()
    );
}

function normalizeDatabase($db)
{
    $activeClass = sanitizeClassName(isset($db['activeClass']) ? $db['activeClass'] : DEFAULT_CLASS_NAME);
    if ($activeClass === '') {
        $activeClass = DEFAULT_CLASS_NAME;
    }

    $classes = isset($db['classes']) && is_array($db['classes']) ? $db['classes'] : array();
    $history = isset($db['history']) && is_array($db['history']) ? $db['history'] : array();

    $normalized = array(
        'activeClass' => $activeClass,
        'classes' => $classes,
        'history' => $history
    );

    getOrCreateClass($normalized, $activeClass);

    return $normalized;
}

function getActiveClass(&$db)
{
    $activeClass = sanitizeClassName(isset($db['activeClass']) ? $db['activeClass'] : DEFAULT_CLASS_NAME);

    if ($activeClass === '') {
        $activeClass = DEFAULT_CLASS_NAME;
    }

    $db['activeClass'] = $activeClass;
    getOrCreateClass($db, $activeClass);

    return $activeClass;
}

function &getOrCreateClass(&$db, $className)
{
    $className = sanitizeClassName($className);

    if ($className === '') {
        $className = DEFAULT_CLASS_NAME;
    }

    if (!isset($db['classes']) || !is_array($db['classes'])) {
        $db['classes'] = array();
    }

    if (!isset($db['classes'][$className]) || !is_array($db['classes'][$className])) {
        $db['classes'][$className] = array(
            'queue' => array(),
            'updatedAt' => nowIso()
        );
    }

    if (!isset($db['classes'][$className]['queue']) || !is_array($db['classes'][$className]['queue'])) {
        $db['classes'][$className]['queue'] = array();
    }

    $cleanQueue = array();
    foreach ($db['classes'][$className]['queue'] as $group) {
        $group = (string)$group;
        if (preg_match('/^[1-8]$/', $group)) {
            $cleanQueue[] = $group;
        }
    }

    $db['classes'][$className]['queue'] = array_values(array_unique($cleanQueue));

    if (empty($db['classes'][$className]['updatedAt'])) {
        $db['classes'][$className]['updatedAt'] = nowIso();
    }

    return $db['classes'][$className];
}

function addHistory(&$db, $className, $groupNumber, $action)
{
    $classData =& getOrCreateClass($db, $className);

    if (!isset($db['history']) || !is_array($db['history'])) {
        $db['history'] = array();
    }

    $db['history'][] = array(
        'timestamp' => nowIso(),
        'className' => $className,
        'groupNumber' => $groupNumber,
        'action' => $action,
        'queueSnapshot' => $classData['queue'],
        'ip' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null
    );

    if (count($db['history']) > MAX_HISTORY_ITEMS) {
        $db['history'] = array_slice($db['history'], -MAX_HISTORY_ITEMS);
    }
}

function makeStateResponse(&$db, $groupNumber)
{
    $activeClass = getActiveClass($db);
    $classData =& getOrCreateClass($db, $activeClass);

    return array(
        'ok' => true,
        'className' => $activeClass,
        'groupNumber' => $groupNumber,
        'queue' => $classData['queue'],
        'updatedAt' => isset($classData['updatedAt']) ? $classData['updatedAt'] : nowIso()
    );
}

function sanitizeClassName($value)
{
    $value = trim((string)$value);
    $value = preg_replace('/\s+/', ' ', $value);
    return substr($value, 0, 150);
}

function sanitizeGroupNumber($value)
{
    $value = trim((string)$value);
    return preg_match('/^[1-8]$/', $value) ? $value : '';
}

function nowIso()
{
    return gmdate('c');
}

function jsonResponse($data)
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function errorResponse($message, $status)
{
    http_response_code($status);
    echo json_encode(array(
        'ok' => false,
        'error' => $message
    ), JSON_UNESCAPED_UNICODE);
    exit;
}
