export const appendProjectId = (formData, projectId) => {
  if (!projectId) {
    throw new Error('project_id is required');
  }
  formData.append('project_id', projectId);
  return formData;
};

export const requireProjectId = projectId => {
  if (!projectId) {
    throw new Error('Select or create a project before uploading.');
  }
  return projectId;
};
