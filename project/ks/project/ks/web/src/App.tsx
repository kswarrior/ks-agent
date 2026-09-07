import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { Card, CardHeader, CardTitle, CardBody, Badge, Button } from "react-bootstrap";

const App: React.FC = () => {
  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h1 className="mb-3">KS Panel - Minecraft Server Panel</h1>
          <p className="text-muted">Owner: KS Warrior</p>
        </Col>
      </Row>

      <Row>
        <Col md={12}>
          <Card>
            <CardHeader>
              <CardTitle>Server List</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-muted">Connect your backend API to manage servers</p>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="mt-4">
        <Col md={12}>
          <Card>
            <CardHeader>
              <CardTitle>Add New Server</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-muted small">Server management interface</p>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default App;