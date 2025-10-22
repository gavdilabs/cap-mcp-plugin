namespace uniorg.brandstore;

@path: 'uniorg/brandstore/experience'
service ExperienceService {
  @mcp: {
    name       : 'get-order',
    description: 'Get order by ID',
    tool       : true
  }
  function getOrder(ID : Integer) returns {
    value : Integer
  };
}
