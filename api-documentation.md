# API Documentation

## Tags API

### Get All Tags

Retrieves all tags from the 300.xml file.

**URL**: `/api/default/tags`

**Method**: `GET`

**Auth required**: No

**Permissions required**: None

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "tags": [
    {
      "observationtype": "HR",
      "datatype": "NM",
      "encode": "147842",
      "parameterlabel": "MDC_ECG_HEART_RATE",
      "encodesystem": "MDC",
      "subid": "1.7.4.147842",
      "description": "HR",
      "source": "ECG",
      "channel": "ECG_Heart_Rate",
      "channelid": "1.7.4"
    },
    // ... more tags
  ]
}
```

### Error Response

**Condition**: If there is an error retrieving the tags.

**Code**: `500 INTERNAL SERVER ERROR`

**Content example**:

```json
{
  "success": false,
  "message": "Failed to retrieve tags",
  "error": "Error message"
}
```

## Custom Tag Mappings API

Users can create custom tag mappings based on the default tags, which can be modified as needed. Custom tag mappings can be stored in different JSON files, with the filename specified by the user.

### Initialize Custom Tag Mappings

Initializes custom tag mappings from a specific JSON file. This endpoint should be called before other operations if you want to work with a custom file.

**URL**: `/api/custom-tags/initialize`

**Method**: `POST`

**Auth required**: No

**Permissions required**: None

**Request Body**:

```json
{
  "filename": "my_custom_tags.json"
}
```

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mappings initialized from my_custom_tags.json"
}
```

### Error Response

**Code**: `400 BAD REQUEST`

**Content example**:

```json
{
  "success": false,
  "message": "Filename is required"
}
```

**OR**

**Code**: `500 INTERNAL SERVER ERROR`

**Content example**:

```json
{
  "success": false,
  "message": "Failed to initialize custom tag mappings",
  "error": "Error message"
}
```

### List All Custom Tag Mappings

Retrieves a list of all available custom tag mappings.

**URL**: `/api/custom-tags`

**Method**: `GET`

**Auth required**: No

**Permissions required**: None

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "mappings": ["custom1", "custom2", "myTags"]
}
```

### Error Response

**Code**: `500 INTERNAL SERVER ERROR`

**Content example**:

```json
{
  "success": false,
  "message": "Failed to retrieve custom tag mappings list",
  "error": "Error message"
}
```

### Get Custom Tag Mapping

Retrieves a specific custom tag mapping by name.

**URL**: `/api/:mappingName/tags`

**Method**: `GET`

**URL Parameters**: 
- `mappingName`: Name of the custom mapping to retrieve

**Auth required**: No

**Permissions required**: None

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "tags": [
    {
      "observationtype": "HR",
      "datatype": "NM",
      "encode": "147842",
      "parameterlabel": "MDC_ECG_HEART_RATE",
      "encodesystem": "MDC",
      "subid": "1.7.4.147842",
      "description": "HR",
      "source": "ECG",
      "channel": "ECG_Heart_Rate",
      "channelid": "1.7.4"
    },
    // ... more tags
  ],
  "mappingName": "custom1",
  "createdAt": "2023-06-15T10:30:00.000Z",
  "updatedAt": "2023-06-15T10:30:00.000Z"
}
```

### Error Response

**Code**: `404 NOT FOUND`

**Content example**:

```json
{
  "success": false,
  "message": "Custom tag mapping not found"
}
```

### Create Custom Tag Mapping

Creates a new custom tag mapping.

**URL**: `/api/custom-tags`

**Method**: `POST`

**Auth required**: No

**Permissions required**: None

**Request Body**:

```json
{
  "name": "myCustomTags",
  "tags": [
    {
      "observationtype": "HR",
      "datatype": "NM",
      "encode": "147842",
      "parameterlabel": "MDC_ECG_HEART_RATE",
      "encodesystem": "MDC",
      "subid": "1.7.4.147842",
      "description": "HR",
      "source": "ECG",
      "channel": "ECG_Heart_Rate",
      "channelid": "1.7.4"
    },
    // ... more tags
  ],
  "filename": "my_custom_tags.json"
}
```

Notes:
- If `tags` is not provided, the default tags will be used as a starting point.
- If `filename` is not provided, the default "custom_tags.json" file will be used.

### Success Response

**Code**: `201 CREATED`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mapping created successfully",
  "mapping": {
    "tags": [
      // ... tags array
    ],
    "createdAt": "2023-06-15T10:30:00.000Z",
    "updatedAt": "2023-06-15T10:30:00.000Z"
  }
}
```

### Error Response

**Code**: `400 BAD REQUEST`

**Content example**:

```json
{
  "success": false,
  "message": "A mapping with this name already exists"
}
```

### Update Custom Tag Mapping

Updates an existing custom tag mapping.

**URL**: `/api/custom-tags/:name`

**Method**: `PUT`

**URL Parameters**: 
- `name`: Name of the custom mapping to update

**Auth required**: No

**Permissions required**: None

**Request Body**:

```json
{
  "tags": [
    // ... updated tags array
  ],
  "filename": "my_custom_tags.json"
}
```

Note: If `filename` is not provided, the default "custom_tags.json" file will be used.

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mapping updated successfully",
  "mapping": {
    "tags": [
      // ... updated tags array
    ],
    "createdAt": "2023-06-15T10:30:00.000Z",
    "updatedAt": "2023-06-15T11:45:00.000Z"
  }
}
```

### Error Response

**Code**: `404 NOT FOUND`

**Content example**:

```json
{
  "success": false,
  "message": "Custom tag mapping not found"
}
```

### Delete Custom Tag Mapping

Deletes a custom tag mapping.

**URL**: `/api/custom-tags/:name`

**Method**: `DELETE`

**URL Parameters**: 
- `name`: Name of the custom mapping to delete

**Query Parameters**:
- `filename` (optional): Name of the custom tags file to use (defaults to "custom_tags.json")

**Auth required**: No

**Permissions required**: None

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mapping deleted successfully"
}
```

### Error Response

**Code**: `404 NOT FOUND`

**Content example**:

```json
{
  "success": false,
  "message": "Custom tag mapping not found"
}
```

### Clone Custom Tag Mapping

Clones an existing custom tag mapping to create a new one with the same tags.

**URL**: `/api/custom-tags/clone`

**Method**: `POST`

**Auth required**: No

**Permissions required**: None

**Request Body**:

```json
{
  "sourceName": "existingMapping",
  "targetName": "newMappingName"
}
```

Notes:
- `sourceName`: The name of the existing mapping to clone
- `targetName`: The name for the new mapping (also used as the filename)

### Success Response

**Code**: `201 CREATED`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mapping \"existingMapping\" cloned to \"newMappingName\" successfully",
  "mapping": {
    "tags": [
      // ... tags array
    ],
    "createdAt": "2023-06-15T10:30:00.000Z",
    "updatedAt": "2023-06-15T10:30:00.000Z"
  }
}
```

### Error Response

**Code**: `400 BAD REQUEST`

**Content example**:

```json
{
  "success": false,
  "message": "Source mapping not found"
}
```

OR

```json
{
  "success": false,
  "message": "A mapping with the target name already exists"
}
```

### Delete Custom Tag Mapping (Alternative Endpoint)

An alternative endpoint to delete a custom tag mapping.

**URL**: `/api/custom-tags/delete`

**Method**: `POST`

**Auth required**: No

**Permissions required**: None

**Request Body**:

```json
{
  "name": "mappingToDelete"
}
```

Notes:
- The `name` parameter is used as both the mapping name to delete and the filename.

### Success Response

**Code**: `200 OK`

**Content example**:

```json
{
  "success": true,
  "message": "Custom tag mapping deleted successfully"
}
```

### Error Response

**Code**: `404 NOT FOUND`

**Content example**:

```json
{
  "success": false,
  "message": "Custom tag mapping not found"
}
```

## Notes

- The default tags are read from the 300.xml file and cannot be modified by users.
- Custom tag mappings are stored in JSON files and can be created, retrieved, updated, and deleted via the API.
- Users can specify different filenames for custom tag mappings, allowing for multiple sets of mappings.
- If no filename is specified, the default "custom_tags.json" file is used.
- To work with a specific custom tags file, first call the initialize endpoint, then perform other operations.
- The API returns all tags without any specific order.
