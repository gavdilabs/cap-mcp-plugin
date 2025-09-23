namespace my.bookshop;

entity Books {
  key ID     : Integer;
      title  : String;
      stock  : Integer;
      author : Association to Authors;
}

entity Authors {
  key ID    : Integer;
      name  : String;
      books : Association to many Books
                on books.author = $self;
}

entity MultiKeyExample {
  key ID          : Integer;
  key ExternalKey : Integer;
      description : String;
}

type TValidQuantities {
  positiveOnly : TMyNumbers:anInteger @assert.range: [
    0,
    _
  ]
};

type TMyNumbers {
  anInteger : Integer
};

type ComplexType {
  rangedNumber : Integer @assert.range: [
    0,
    10
  ];
}
